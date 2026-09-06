# ===== BusSchedule-Dynamic.ps1 =====
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; .\BusSchedule-Server.ps1

$Config = @{
    SheetId = "1nzePEfu6Vxki9aJG8i3t4kulrf1NXOnTrL1xPdPnIhk"
    SheetGids = @(
        "1493284544", "1707236720", "724645823", "1439884697", "1807952400",
        "1704743358", "1031206989", "412340678",  "242965799",  "982105709",
        "1981236561", "1776587544", "1147588788", "748410195",  "740366988"
    )
    OutputDir = "$env:TEMP\BusSchedule"
    Port = 8000
    LogFile = "$env:TEMP\BusSchedule\updater.log"
    RequestDelayMs = 400
}

$script:Listener = $null

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] [$Level] $Message" | Add-Content $Config.LogFile -Force
    $c = switch($Level){"ERROR"{"Red"};"WARN"{"Yellow"};default{"Cyan"}}
    Write-Host $Message -ForegroundColor $c
}

function Release-Port {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conn) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'powershell') {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
                if ($cmd -match 'BusSchedule') {
                    Write-Log "🧹 Завершаем зависший экземпляр (PID: $($proc.Id))" "WARN"
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 300
                    return $true
                }
            }
            Write-Log "⚠️ Порт $Port занят: $($proc.ProcessName)" "WARN"
            return $false
        }
        return $true
    }
    catch { return $true }
}

function Cleanup {
    Write-Log "🛑 Завершение..." "WARN"
    if ($script:Listener -and $script:Listener.IsListening) {
        try { $script:Listener.Stop(); $script:Listener.Close(); Write-Log "✅ Сервер остановлен" }
        catch { Write-Log "⚠️ Ошибка: $($_.Exception.Message)" "WARN" }
    }
    Get-NetTCPConnection -LocalPort $Config.Port -ErrorAction SilentlyContinue | ForEach-Object {
        try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
    }
    exit 0
}
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

function Get-RouteData-Universal {
    param([string]$Gid)
    try {
        $url = "https://docs.google.com/spreadsheets/d/$($Config.SheetId)/gviz/tq?tqx=out:csv&gid=$Gid"
        $headers = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 30
        
        if ($resp.Content -match '<!DOCTYPE html>|login|401') { 
            Write-Log "  ⚠️ gid=$Gid : доступ запрещён" "WARN"
            return @() 
        }
        
        $lines = $resp.Content -split "`n" | Where-Object { $_.Trim() }
        $routes = @()

        # --- СПЕЦИАЛЬНЫЙ СЛУЧАЙ: gid=740366988 (лист с двумя областями + A1:A2-C12) ---
        if ($Gid -eq "740366988") {
            Write-Log "  🔍 Обработка gid=740366988 (две области + A1:A2-C12)" "INFO"
            
            # 1) Парсим левую часть (A:C) — первая область
            $leftRoutes = @()
            $current = $null
            $stops = @()
            
            # Ищем название маршрута для левой части (B1:C1)
            $leftName = "Маршрут"
            for ($i = 0; $i -lt [Math]::Min(3, $lines.Count); $i++) {
                $clean = $lines[$i].Trim() -replace '^"|"$', ''
                $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                if ($cells.Count -ge 3) {
                    $part1 = if ($cells[1]) { $cells[1] } else { "" }
                    $part2 = if ($cells[2]) { $cells[2] } else { "" }
                    if ($part1 -and $part2) {
                        $leftName = "$part1 $part2"
                        Write-Log "    🏷️ Название левой области: $leftName" "INFO"
                        break
                    }
                }
            }
            
            # Парсим маршрут из A1:A2-C12 (первая строка — остановки, остальные — время)
            $leftStops = @()
            $leftSchedule = @()
            $leftNumber = ""
            
            # Ищем строку с остановками (первая непустая после заголовков)
            $stopRowIndex = -1
            for ($i = 0; $i -lt [Math]::Min(15, $lines.Count); $i++) {
                $clean = $lines[$i].Trim() -replace '^"|"$', ''
                $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                if ($cells.Count -ge 3) {
                    # Проверяем, есть ли в первых трёх колонках что-то похожее на остановки
                    $hasStopLike = $false
                    for ($c = 0; $c -lt 3; $c++) {
                        if ($cells[$c] -and $cells[$c] -match 'АС|п\.|ст\.|с\.|Школа|Горбольница|Такман|Архиповка|вокзал|ГЛК') {
                            $hasStopLike = $true
                            break
                        }
                    }
                    if ($hasStopLike -and $stopRowIndex -eq -1) {
                        $stopRowIndex = $i
                        $leftStops = @($cells[0], $cells[1], $cells[2]) | Where-Object { $_ }
                        Write-Log "    🛑 Остановки левой области: $($leftStops -join ', ')" "INFO"
                        # Номер маршрута может быть в этой же строке или выше, попробуем взять из A1
                        if ($cells[0] -match '^\d{1,3}$') {
                            $leftNumber = $cells[0]
                        }
                    }
                    # Если остановки уже найдены, ищем строки с временем
                    if ($stopRowIndex -ne -1 -and $i -gt $stopRowIndex) {
                        if ($cells.Count -ge 3) {
                            $times = @()
                            for ($c = 0; $c -lt 3; $c++) {
                                if ($cells[$c] -match '^\d{1,2}-\d{2}$') {
                                    $times += $cells[$c]
                                } else {
                                    $times += $null
                                }
                            }
                            if ($times[0] -or $times[1] -or $times[2]) {
                                $trip = @{}
                                for ($idx = 0; $idx -lt $leftStops.Count; $idx++) {
                                    if ($times[$idx]) {
                                        $trip[$leftStops[$idx]] = $times[$idx]
                                    }
                                }
                                if ($trip.Count -gt 0) {
                                    $leftSchedule += $trip
                                }
                            }
                        }
                    }
                }
                if ($lines[$i] -match 'Текущее время') { break }
            }
            
            if ($leftStops.Count -gt 0 -and $leftSchedule.Count -gt 0) {
                if (-not $leftNumber) { $leftNumber = "1" }  # fallback
                $leftRoutes += @{
                    number = $leftNumber
                    name = $leftName
                    streets = ""
                    stops = $leftStops
                    schedule = $leftSchedule
                    scheduleType = "daily"
                }
                Write-Log "    ✅ Добавлен маршрут из A1:A2-C12: №$leftNumber, остановок: $($leftStops.Count), рейсов: $($leftSchedule.Count)" "INFO"
            }

            # 2) Парсим правую часть (E:...) — вторая область
            $rightRoutes = @()
            foreach ($baseCol in @(4)) {  # колонка E (индекс 4)
                $current = $null
                $stops = @()
                
                foreach ($line in $lines) {
                    $clean = $line.Trim() -replace '^"|"$', ''
                    $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                    $cells = $cells | Where-Object { $_ -ne $null }
                    if ($cells.Count -eq 0) { continue }
                    
                    if ($baseCol -lt $cells.Count) {
                        if ($cells[$baseCol] -match '^\d{1,3}$' -and $cells.Count -gt ($baseCol+1)) {
                            if ($cells[$baseCol+1] -match 'АС Чусовой|п\.|ст\.|с\.') {
                                if ($current -and $current.schedule.Count -gt 0) { $rightRoutes += $current }
                                $current = @{ number=$cells[$baseCol]; name=$cells[$baseCol+1]; streets=""; stops=@(); schedule=@(); baseCol=$baseCol; scheduleType="daily" }
                                $stops = @()
                            }
                        }
                    }
                    
                    if (-not $current) { continue }
                    
                    if (-not $current.streets) {
                        for ($c = $current.baseCol; $c -lt [Math]::Min($current.baseCol+4, $cells.Count); $c++) {
                            if ($cells[$c] -match '^Через:\s*(.+)') { $current.streets = $matches[1].Trim(); break }
                        }
                    }
                    
                    if ($stops.Count -eq 0) {
                        $potentialStops = @()
                        $hasTime = $false
                        for ($c = $current.baseCol + 1; $c -lt $cells.Count; $c++) {
                            $val = $cells[$c]
                            if ($val -match '^\d{1,2}-\d{2}') { $hasTime = $true; break }
                            if ($val -and $val -notmatch 'ежедневно|рабочие|выходные|Через:|Текущее|НАПРАВЛЕНИЕ|утром|вечером') { $potentialStops += $val }
                        }
                        if ($potentialStops.Count -ge 2 -and -not $hasTime) { $stops = $potentialStops; $current.stops = $stops }
                    }
                    
                    if ($stops.Count -ge 2) {
                        $rowSchedule = @{}
                        $hasAnyTime = $false
                        for ($i = 0; $i -lt $stops.Count; $i++) {
                            $colIndex = $current.baseCol + 1 + $i
                            if ($colIndex -lt $cells.Count) {
                                $val = $cells[$colIndex]
                                if ($val -and $val -match '\d{1,2}-\d{2}') { $rowSchedule[$stops[$i]] = $val; $hasAnyTime = $true }
                            }
                        }
                        if ($hasAnyTime) { $current.schedule += $rowSchedule }
                    }
                    if ($line -match 'Текущее время') { break }
                }
                if ($current -and $current.schedule.Count -gt 0) { $rightRoutes += $current }
            }
            
            # Объединяем левую и правую части
            $routes = @($leftRoutes) + @($rightRoutes)
            Write-Log "  📊 Всего на листе: $($routes.Count) маршрутов" "INFO"
            return $routes
        }
        
        # 🔥 gid=748410195 - Маршрут 22: утро/вечер (разделены строкой с "вечером")
        if ($Gid -eq "748410195") {
            Write-Log "  🔍 Обработка gid=748410195 (утро/вечер)" "INFO"
            
            $current = $null
            $morningStops = @()
            $eveningStops = @()
            $currentPart = "morning"
            
            foreach ($line in $lines) {
                $clean = $line.Trim() -replace '^"|"$', ''
                $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                $cells = $cells | Where-Object { $_ -ne $null }
                if ($cells.Count -eq 0) { continue }
                
                # Ищем начало маршрута
                if ($cells[0] -match '^\d{1,3}$' -and $cells.Count -gt 1) {
                    if ($cells[1] -match 'Школа|ГЛК|Такман') {
                        if ($current -and ($current.morningSchedule.Count -gt 0 -or $current.eveningSchedule.Count -gt 0)) {
                            $routes += $current
                            Write-Log "    ✅ Сохранён маршрут $($current.number) (утро: $($current.morningSchedule.Count), вечер: $($current.eveningSchedule.Count))" "INFO"
                        }
                        
                        $current = @{
                            number = $cells[0]
                            name = $cells[1]
                            streets = ""
                            scheduleType = "split-time"
                            morningStops = @()
                            eveningStops = @()
                            morningSchedule = @()
                            eveningSchedule = @()
                        }
                        $morningStops = @()
                        $eveningStops = @()
                        $currentPart = "morning"
                    }
                }
                
                if (-not $current) { continue }
                
                # Ищем улицы
                if (-not $current.streets) {
                    for ($c = 0; $c -lt $cells.Count; $c++) {
                        if ($cells[$c] -match '^Через:\s*(.+)') {
                            $current.streets = $matches[1].Trim(); break
                        }
                    }
                }
                
                # Определяем часть (утро/вечер)
                if ($line -match 'утром') { 
                    $currentPart = "morning"
                }
                if ($line -match 'вечером') { 
                    $currentPart = "evening"
                }
                
                # Ищем заголовки остановок для утра (колонки B,C,D,E - индексы 1,2,3,4)
                if ($currentPart -eq "morning" -and $morningStops.Count -eq 0 -and $cells.Count -gt 4) {
                    $potential = @()
                    for ($i = 1; $i -le 4; $i++) {
                        if ($cells[$i] -and $cells[$i] -notmatch '^\d{1,2}-\d{2}' -and $cells[$i] -match 'Школа|Архиповка|вокзал|ГЛК|Такман') {
                            $potential += $cells[$i]
                        }
                    }
                    if ($potential.Count -ge 3) {
                        $morningStops = $potential
                        $current.morningStops = $morningStops
                        Write-Log "    🛑 Остановки (утро): $($morningStops -join ', ')" "INFO"
                    }
                }
                
                # Ищем заголовки остановок для вечера (колонки B,C,D - индексы 1,2,3)
                if ($currentPart -eq "evening" -and $eveningStops.Count -eq 0 -and $cells.Count -gt 3) {
                    $potential = @()
                    for ($i = 1; $i -le 3; $i++) {
                        if ($cells[$i] -and $cells[$i] -notmatch '^\d{1,2}-\d{2}' -and $cells[$i] -match 'Школа|Архиповка|вокзал|ГЛК|Такман') {
                            $potential += $cells[$i]
                        }
                    }
                    if ($potential.Count -ge 2) {
                        $eveningStops = $potential
                        $current.eveningStops = $eveningStops
                        Write-Log "    🛑 Остановки (вечер): $($eveningStops -join ', ')" "INFO"
                    }
                }
                
                # Парсим время для утра
                if ($currentPart -eq "morning" -and $morningStops.Count -gt 0) {
                    $rowSchedule = @{}
                    $hasTime = $false
                    
                    for ($i = 0; $i -lt $morningStops.Count; $i++) {
                        $colIndex = $i + 1
                        if ($colIndex -lt $cells.Count) {
                            $val = $cells[$colIndex]
                            if ($val -and $val -match '(\d{1,2}-\d{2})') {
                                $rowSchedule[$morningStops[$i]] = $matches[1]
                                $hasTime = $true
                            }
                        }
                    }
                    
                    if ($hasTime) {
                        $current.morningSchedule += $rowSchedule
                    }
                }
                
                # Парсим время для вечера
                if ($currentPart -eq "evening" -and $eveningStops.Count -gt 0) {
                    $rowSchedule = @{}
                    $hasTime = $false
                    
                    for ($i = 0; $i -lt $eveningStops.Count; $i++) {
                        $colIndex = $i + 1
                        if ($colIndex -lt $cells.Count) {
                            $val = $cells[$colIndex]
                            if ($val -and $val -match '(\d{1,2}-\d{2})') {
                                $rowSchedule[$eveningStops[$i]] = $matches[1]
                                $hasTime = $true
                            }
                        }
                    }
                    
                    if ($hasTime) {
                        $current.eveningSchedule += $rowSchedule
                    }
                }
                
                if ($line -match 'Текущее время') { break }
            }
            
            if ($current) {
                if ($current.morningSchedule.Count -gt 0 -or $current.eveningSchedule.Count -gt 0) {
                    $routes += $current
                }
            }
        }
        # 🔥 gid=1707236720 - рабочие/выходные
        elseif ($Gid -eq "1707236720") {
            $current = $null
            $weekdayStops = @()
            $weekendStops = @()
            
            foreach ($line in $lines) {
                $clean = $line.Trim() -replace '^"|"$', ''
                $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                $cells = $cells | Where-Object { $_ -ne $null }
                if ($cells.Count -eq 0) { continue }
                
                if ($cells[0] -match '^\d{1,3}$' -and $cells.Count -gt 1) {
                    if ($cells[1] -match 'Школа|Горбольница') {
                        if ($current -and ($current.weekdaySchedule.Count -gt 0 -or $current.weekendSchedule.Count -gt 0)) {
                            $routes += $current
                        }
                        
                        $current = @{
                            number = $cells[0]
                            name = $cells[1]
                            streets = ""
                            scheduleType = "daily"
                            weekdayStops = @()
                            weekendStops = @()
                            weekdaySchedule = @()
                            weekendSchedule = @()
                        }
                        $weekdayStops = @()
                        $weekendStops = @()
                    }
                }
                
                if (-not $current) { continue }
                
                if (-not $current.streets) {
                    for ($c = 0; $c -lt $cells.Count; $c++) {
                        if ($cells[$c] -match '^Через:\s*(.+)') {
                            $current.streets = $matches[1].Trim(); break
                        }
                    }
                }
                
                if ($line -match 'рабочие') { $current.scheduleType = "split" }
                if ($line -match 'выходные') { $current.scheduleType = "split" }
                
                if ($weekdayStops.Count -eq 0 -and $cells.Count -gt 2) {
                    if ($cells[1] -and $cells[2] -and $cells[1] -notmatch '^\d{1,2}-\d{2}' -and $cells[2] -notmatch '^\d{1,2}-\d{2}') {
                        if ($cells[1] -match 'Школа|Горбольница' -and $cells[2] -match 'Школа|Горбольница') {
                            $weekdayStops = @($cells[1], $cells[2])
                            $current.weekdayStops = $weekdayStops
                        }
                    }
                }
                
                if ($weekendStops.Count -eq 0 -and $cells.Count -gt 5) {
                    if ($cells[4] -and $cells[5] -and $cells[4] -notmatch '^\d{1,2}-\d{2}' -and $cells[5] -notmatch '^\d{1,2}-\d{2}') {
                        if ($cells[4] -match 'Школа|Горбольница' -and $cells[5] -match 'Школа|Горбольница') {
                            $weekendStops = @($cells[4], $cells[5])
                            $current.weekendStops = $weekendStops
                        }
                    }
                }
                
                if ($weekdayStops.Count -eq 2 -and $cells.Count -gt 2) {
                    $rowSchedule = @{}
                    $hasTime = $false
                    for ($i = 0; $i -lt $weekdayStops.Count; $i++) {
                        $colIndex = $i + 1
                        if ($colIndex -lt $cells.Count) {
                            $val = $cells[$colIndex]
                            if ($val -and $val -match '\d{1,2}-\d{2}') {
                                $rowSchedule[$weekdayStops[$i]] = $val
                                $hasTime = $true
                            }
                        }
                    }
                    if ($hasTime) { $current.weekdaySchedule += $rowSchedule }
                }
                
                if ($weekendStops.Count -eq 2 -and $cells.Count -gt 5) {
                    $rowSchedule = @{}
                    $hasTime = $false
                    for ($i = 0; $i -lt $weekendStops.Count; $i++) {
                        $colIndex = $i + 4
                        if ($colIndex -lt $cells.Count) {
                            $val = $cells[$colIndex]
                            if ($val -and $val -match '\d{1,2}-\d{2}') {
                                $rowSchedule[$weekendStops[$i]] = $val
                                $hasTime = $true
                            }
                        }
                    }
                    if ($hasTime) { $current.weekendSchedule += $rowSchedule }
                }
                
                if ($line -match 'Текущее время') { break }
            }
            
            if ($current) {
                if ($current.scheduleType -eq "split" -and $current.weekendSchedule.Count -eq 0) {
                    $current.scheduleType = "daily"
                    $current.stops = $current.weekdayStops
                    $current.schedule = $current.weekdaySchedule
                }
                if ($current.weekdaySchedule.Count -gt 0 -or $current.weekendSchedule.Count -gt 0) {
                    $routes += $current
                }
            }
        }
        # 🔥 Стандартная логика для остальных листов
        else {
            $current = $null; $stops = @(); $scheduleType = "daily"
            foreach ($line in $lines) {
                $clean = $line.Trim() -replace '^"|"$', ''
                $cells = $clean -split '","' | ForEach-Object { $_ -replace '^"|"$', '' }
                $cells = $cells | Where-Object { $_ -ne $null }
                if ($cells.Count -eq 0) { continue }
                
                foreach ($baseCol in 0) {
                    if ($baseCol -lt $cells.Count) {
                        if ($cells[$baseCol] -match '^\d{1,3}$' -and $cells.Count -gt ($baseCol+1)) {
                            if ($cells[$baseCol+1] -match 'пл\.|п\.|ул\.|АС |ст\.|Школа|ГЛК|Горбольница|Перевал|Кошково|Архиповка|Кучино|Копально|Калино|Такман|Сплавщиков|Коммунистическая|Севастопольская|Металлургов|Революционная|Кирова|Всесвятская|Мыс|Центральный') {
                                if ($current -and $current.schedule.Count -gt 0) { $current.scheduleType = $scheduleType; $routes += $current }
                                $current = @{ number=$cells[$baseCol]; name=$cells[$baseCol+1]; streets=""; stops=@(); schedule=@(); baseCol=$baseCol }
                                $stops = @(); $scheduleType = "daily"; break
                            }
                        }
                    }
                }
                if (-not $current) { continue }
                if (-not $current.streets) { for ($c = $current.baseCol; $c -lt [Math]::Min($current.baseCol+4, $cells.Count); $c++) { if ($cells[$c] -match '^Через:\s*(.+)') { $current.streets = $matches[1].Trim(); break } } }
                if ($stops.Count -eq 0) { $potentialStops = @(); $hasTime = $false; for ($c = $current.baseCol + 1; $c -lt $cells.Count; $c++) { $val = $cells[$c]; if ($val -match '^\d{1,2}-\d{2}') { $hasTime = $true; break }; if ($val -and $val -notmatch 'ежедневно|рабочие|выходные|Через:|Текущее|НАПРАВЛЕНИЕ|утром|вечером') { $potentialStops += $val } }; if ($potentialStops.Count -ge 2 -and -not $hasTime) { $stops = $potentialStops; $current.stops = $stops } }
                if ($stops.Count -ge 2) { $rowSchedule = @{}; $hasAnyTime = $false; for ($i = 0; $i -lt $stops.Count; $i++) { $colIndex = $current.baseCol + 1 + $i; if ($colIndex -lt $cells.Count) { $val = $cells[$colIndex]; if ($val -and $val -match '\d{1,2}-\d{2}') { $rowSchedule[$stops[$i]] = $val; $hasAnyTime = $true } } }; if ($hasAnyTime) { $current.schedule += $rowSchedule } }
                if ($line -match 'Текущее время') { break }
            }
            if ($current -and $current.schedule.Count -gt 0) { $current.scheduleType = $scheduleType; $routes += $current }
        }
        return $routes
    }
    catch { Write-Log "  ❌ gid=$Gid : Ошибка - $($_.Exception.Message)" "ERROR"; return @() }
}

function Make-Html {
    param([array]$Routes)
    $ts = Get-Date -Format "dd.MM.yyyy HH:mm"
    $jsRoutes = @()
    foreach ($r in $Routes) {
        $routeObj = @{ number=[string]$r.number; name=[string]$r.name; streets=[string]$r.streets; stops=if($r.stops){[string[]]$r.stops}else{@()}; schedule=$r.schedule; weekdayStops=if($r.weekdayStops){[string[]]$r.weekdayStops}else{@()}; weekendStops=if($r.weekendStops){[string[]]$r.weekendStops}else{@()}; morningStops=if($r.morningStops){[string[]]$r.morningStops}else{@()}; eveningStops=if($r.eveningStops){[string[]]$r.eveningStops}else{@()}; weekdaySchedule=$r.weekdaySchedule; weekendSchedule=$r.weekendSchedule; morningSchedule=$r.morningSchedule; eveningSchedule=$r.eveningSchedule; scheduleType=if($r.scheduleType){[string]$r.scheduleType}else{"daily"} }
        $jsRoutes += $routeObj
    }
    $routesJson = ConvertTo-Json -InputObject $jsRoutes -Depth 6 -Compress

    $html = @"
<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Расписание движения</title>
<style>
:root{--bg-primary:#f5f7fa;--bg-card:#fff;--text-primary:#1a1a1a;--text-secondary:#4a5568;--text-muted:#718096;--border-color:#cbd5e0;--accent-blue:#2563eb;--accent-red:#dc2626;--highlight-bg:#fef3c7;--highlight-border:#f59e0b;--highlight-text:#92400e}
[data-theme="dark"]{--bg-primary:#1a1a2e;--bg-card:#16213e;--text-primary:#fff;--text-secondary:#e8e8e8;--text-muted:#b0b0b0;--border-color:#3a3a5c;--accent-blue:#3b82f6}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-primary);color:var(--text-primary);line-height:1.6}
.container{max-width:1400px;margin:0 auto;padding:2rem}
header{background:var(--bg-card);border-bottom:4px solid var(--accent-blue);padding:2rem 0;margin-bottom:2.5rem}
h1{font-size:2rem;font-weight:700;margin-bottom:0.5rem}
.info-bar{display:flex;gap:1.5rem;margin-top:1.2rem;align-items:center;flex-wrap:wrap}
.badge{background:var(--accent-blue);color:#fff;padding:0.5rem 1.2rem;border-radius:6px;font-weight:600}
.realtime{font-family:Consolas,monospace;font-size:1.05rem;color:var(--accent-blue);font-weight:700}
.theme-toggle{margin-left:auto;display:flex;align-items:center;gap:0.5rem}
.toggle-btn{background:var(--bg-card);border:3px solid var(--border-color);border-radius:8px;padding:0.5rem 1rem;cursor:pointer;font-size:1.3rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;margin-bottom:2rem}
.route-card{background:var(--bg-card);border:3px solid var(--border-color);border-radius:8px;padding:1.6rem;cursor:pointer;transition:all 0.2s}
.route-card:hover{transform:translateY(-3px);box-shadow:0 4px 16px rgba(0,0,0,0.12);border-color:var(--accent-blue)}
.route-number{font-size:1.8rem;font-weight:800;color:var(--accent-blue);margin-bottom:0.6rem;border-bottom:2px solid var(--border-color);padding-bottom:0.6rem}
.route-name{font-size:1.05rem;font-weight:700;margin-bottom:0.5rem}
.route-streets{font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.8rem;font-style:italic}
.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;padding:1rem}
.modal.active{display:flex}
.modal-content{background:var(--bg-card);border-radius:10px;max-width:95%;width:100%;max-height:90vh;overflow-y:auto}
.modal-header{background:var(--accent-blue);color:#fff;padding:1.6rem;position:relative}
.modal-number{font-size:2.2rem;font-weight:800;margin-bottom:0.4rem}
.modal-title{font-size:1.3rem;font-weight:700;margin-bottom:0.4rem}
.modal-streets{font-size:0.95rem;opacity:0.95}
.modal-close{position:absolute;top:1.2rem;right:1.2rem;background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.4);color:#fff;width:40px;height:40px;border-radius:6px;cursor:pointer;font-size:1.6rem}
.modal-body{padding:1.6rem}
.schedule-container{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:1rem}
.schedule-section{background:var(--bg-primary);border-radius:8px;padding:1rem;border:2px solid var(--border-color)}
.schedule-title{font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:1rem;text-align:center;padding:0.5rem;border-radius:6px}
.schedule-title.weekday{background:var(--accent-blue)}
.schedule-title.weekend{background:var(--accent-red)}
.schedule-title.morning{background:#10b981}
.schedule-title.evening{background:#f59e0b;color:#1a1a1a}
.table-wrapper{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;min-width:400px}
th{background:var(--bg-card);padding:0.8rem 0.5rem;text-align:center;font-weight:700;border-bottom:2px solid var(--border-color);white-space:nowrap}
td{padding:0.6rem 0.5rem;border-bottom:1px solid var(--border-color);font-family:Consolas,monospace;font-size:0.95rem;text-align:center;white-space:nowrap}
.time{font-weight:700;color:var(--accent-blue)}
.next-bus-row{background:var(--highlight-bg)!important;font-weight:700}
.next-bus-row .time{background:var(--highlight-border);color:#fff;padding:0.2rem 0.5rem;border-radius:4px}
.modal-next-bus{background:var(--highlight-bg);border:2px solid var(--highlight-border);border-radius:8px;padding:0.8rem;margin-bottom:1rem;color:var(--highlight-text);font-weight:bold;text-align:center;display:none}
footer{text-align:center;padding:2rem;color:var(--text-muted);margin-top:2rem}
@media(max-width:900px){.schedule-container{grid-template-columns:1fr}}
@media(max-width:600px){.modal{padding:0.5rem}.modal-header{padding:1rem}.modal-body{padding:1rem}table{min-width:300px;font-size:0.85rem}th,td{padding:0.5rem 0.3rem}}
</style></head><body><div class="container">
<header><h1>Расписание движения городского транспорта</h1><div class="info-bar"><span class="badge">🔄 Обновлено: $ts</span><span class="realtime" id="mainRealTime">--:--</span><div class="theme-toggle"><button class="toggle-btn" id="themeToggle" onclick="toggleTheme()">🌙</button></div></div></header>
<div class="grid" id="grid"></div><footer><span id="count">0</span> маршрутов • Данные из Google Таблиц</footer></div>
<div class="modal" id="modal" onclick="if(event.target===this)closeModal()"><div class="modal-content" onclick="event.stopPropagation()">
<div class="modal-header"><button class="modal-close" onclick="closeModal()">×</button><div class="modal-number" id="mNum">Маршрут</div><div class="modal-title" id="mTitle"></div><div class="modal-streets" id="mStreets"></div></div>
<div class="modal-body"><div class="modal-next-bus" id="modalNextBus">⏰ Ближайший рейс: <span id="modalNextBusTime"></span></div><div id="scheduleContent"></div></div></div></div>
<script>
const routes = $routesJson;
window.toggleTheme = function() { const c = document.documentElement.getAttribute('data-theme'); const n = c === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem('busScheduleTheme', n); document.getElementById('themeToggle').textContent = n === 'dark' ? '☀️' : '🌙'; }
window.closeModal = function() { document.getElementById('modal').classList.remove('active'); document.body.style.overflow = ''; }
function parseTime(s) { if (!s) return null; const p = s.split('-'); if (p.length !== 2) return null; const h = parseInt(p[0],10), m = parseInt(p[1],10); if (isNaN(h)||isNaN(m)) return null; const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m); }
function renderTable(stops, schedule, containerId, highlight) {
  const container = document.getElementById(containerId);
  if (!stops || stops.length === 0 || !schedule || schedule.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Нет данных</p>'; return null; }
  let html = '<div class="table-wrapper"><table><thead><tr>';
  stops.forEach(stop => { html += '<th>' + stop + '</th>'; });
  html += '</tr></thead><tbody>';
  let nearestTime = null, minDiff = Infinity, nearestRowIdx = -1, now = new Date();
  schedule.forEach((trip, idx) => {
    const firstStop = stops[0], timeStr = trip[firstStop];
    let rowHtml = '<tr>';
    stops.forEach(stop => { const val = trip[stop] || '—'; rowHtml += '<td><span class="time">' + val + '</span></td>'; });
    rowHtml += '</tr>'; html += rowHtml;
    if (highlight && timeStr) {
      const busTime = parseTime(timeStr);
      if (busTime) { if (busTime < now) busTime.setDate(busTime.getDate() + 1); const diff = busTime - now; if (diff > 0 && diff < minDiff) { minDiff = diff; nearestTime = timeStr; nearestRowIdx = idx; } }
    }
  });
  html += '</tbody></table></div>'; container.innerHTML = html;
  if (highlight && nearestRowIdx !== -1) {
    const rows = container.querySelectorAll('tbody tr');
    if (rows[nearestRowIdx]) { rows[nearestRowIdx].classList.add('next-bus-row'); rows[nearestRowIdx].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const totalMin = Math.floor(minDiff / 60000), h = Math.floor(totalMin / 60), m = totalMin % 60;
    const waitText = totalMin < 60 ? '(через ' + totalMin + ' мин)' : '(через ' + h + ' ч ' + m + ' мин)';
    document.getElementById('modalNextBusTime').textContent = nearestTime + ' ' + waitText;
    document.getElementById('modalNextBus').style.display = 'block';
    return true;
  }
  return false;
}
function openModal(route) {
  if (!route) return;
  document.getElementById('mNum').textContent = 'Маршрут № ' + route.number;
  document.getElementById('mTitle').textContent = route.name;
  document.getElementById('mStreets').textContent = route.streets ? 'Через: ' + route.streets : '';
  document.getElementById('modalNextBus').style.display = 'none';
  const content = document.getElementById('scheduleContent');
  
  if (route.scheduleType === 'split' && route.weekdaySchedule && route.weekdaySchedule.length > 0 && route.weekendSchedule && route.weekendSchedule.length > 0) {
    content.innerHTML = '<div class="schedule-container"><div class="schedule-section"><div class="schedule-title weekday">📅 Будние дни (ПН-ПТ)</div><div id="weekdayTable"></div></div><div class="schedule-section"><div class="schedule-title weekend">📅 Выходные дни (СБ-ВС)</div><div id="weekendTable"></div></div></div>';
    renderTable(route.weekdayStops, route.weekdaySchedule, 'weekdayTable', true);
    renderTable(route.weekendStops, route.weekendSchedule, 'weekendTable', false);
  }
  else if (route.scheduleType === 'split-time' && route.morningSchedule && route.morningSchedule.length > 0) {
    content.innerHTML = '<div class="schedule-container"><div class="schedule-section"><div class="schedule-title morning">🌅 Утро</div><div id="morningTable"></div></div><div class="schedule-section"><div class="schedule-title evening">🌆 Вечер</div><div id="eveningTable"></div></div></div>';
    renderTable(route.morningStops, route.morningSchedule, 'morningTable', true);
    renderTable(route.eveningStops, route.eveningSchedule, 'eveningTable', false);
  }
  else {
    const stopsToUse = route.stops && route.stops.length > 0 ? route.stops : (route.weekdayStops && route.weekdayStops.length > 0 ? route.weekdayStops : route.morningStops);
    const scheduleToUse = route.schedule && route.schedule.length > 0 ? route.schedule : (route.weekdaySchedule && route.weekdaySchedule.length > 0 ? route.weekdaySchedule : route.morningSchedule);
    const titleText = route.scheduleType === 'split' ? 'Будние дни (ПН-ПТ)' : (route.scheduleType === 'split-time' ? 'Утро' : 'Ежедневно');
    content.innerHTML = '<div class="schedule-section"><div class="schedule-title weekday">📅 ' + titleText + '</div><div id="dailyTable"></div></div>';
    renderTable(stopsToUse, scheduleToUse, 'dailyTable', true);
  }
  document.getElementById('modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function updateRealTime() { const now = new Date(); document.getElementById('mainRealTime').textContent = now.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}); }
document.addEventListener('DOMContentLoaded', function() {
  updateRealTime(); setInterval(updateRealTime, 60000);
  // Сортировка маршрутов по номеру
  const sortedRoutes = [...routes].sort((a,b) => {
    const numA = parseInt(a.number, 10) || 999;
    const numB = parseInt(b.number, 10) || 999;
    return numA - numB;
  });
  document.getElementById('count').textContent = sortedRoutes.length;
  if (sortedRoutes && sortedRoutes.length > 0) {
    const grid = document.getElementById('grid');
    sortedRoutes.forEach(r => {
      const card = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = '<div class="route-number">Маршрут № ' + r.number + '</div><div class="route-name">' + r.name + '</div><div class="route-streets">' + (r.streets ? 'Через: ' + r.streets : '') + '</div><div class="route-hint">👉 Нажмите для расписания</div>';
      card.onclick = () => openModal(r);
      grid.appendChild(card);
    });
  }
});
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });
</script></body></html>
"@
    return $html
}

try {
    if (-not (Test-Path $Config.OutputDir)) { New-Item -Path $Config.OutputDir -ItemType Directory -Force | Out-Null }
    Write-Log "=== Проверка порта $($Config.Port) ==="
    if (-not (Release-Port -Port $Config.Port)) { Write-Log "❌ Порт $($Config.Port) занят." "ERROR"; exit 1 }
    Write-Log "=== Генерация из $($Config.SheetGids.Count) листов ==="
    $allRoutes = @()
    foreach ($gid in $Config.SheetGids) {
        Write-Log "📥 gid=$gid ..."
        $routes = Get-RouteData-Universal -Gid $gid
        if ($routes.Count -gt 0) { 
            $allRoutes += $routes
            Write-Log "  ✅ $($routes.Count) маршрутов" 
        }
        Start-Sleep -Milliseconds $Config.RequestDelayMs
    }
    
    # Сортировка всех маршрутов по номеру перед генерацией HTML
    $allRoutes = $allRoutes | Sort-Object { [int]$_.number }
    
    Write-Log "📊 ВСЕГО: $($allRoutes.Count) маршрутов"
    if ($allRoutes.Count -eq 0) { Write-Log "⚠️ Нет данных!" "WARN" }
    $html = Make-Html -Routes $allRoutes
    $out = "$($Config.OutputDir)\index.html"
    $html | Out-File -FilePath $out -Encoding UTF8 -Force
    Write-Log "✅ HTML: $out"
    $script:Listener = New-Object System.Net.HttpListener
    $script:Listener.Prefixes.Add("http://+:$($Config.Port)/")
    $script:Listener.Start()
    Write-Log "🚀 Сервер: http://*:$($Config.Port)" -ForegroundColor Green
    Write-Host "`n📱 http://localhost:$($Config.Port)" -ForegroundColor Cyan
    try { $ip = Invoke-RestMethod -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; Write-Host "🌐 http://$ip`:$($Config.Port)" -ForegroundColor Cyan } catch {}
    Write-Host "`n⏹ CTRL+C для завершения`n"
    while ($script:Listener.IsListening) {
        $ctx = $script:Listener.GetContext(); $resp = $ctx.Response
        if ($ctx.Request.HttpMethod -in @('GET','HEAD')) {
            $b = [IO.File]::ReadAllBytes($out)
            $resp.ContentType='text/html; charset=utf-8'; $resp.ContentLength64=$b.Length
            $resp.Headers.Add('X-Frame-Options','DENY')
            $resp.OutputStream.Write($b,0,$b.Length)
        } else { $resp.StatusCode=405 }
        $resp.Close()
    }
}
catch { if ($_.Exception.Message -notmatch 'Operation canceled|Ctrl') { Write-Log "❌ Ошибка: $($_.Exception.Message)" "ERROR" } }
finally { Cleanup }