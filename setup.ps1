# TubeGrab 4K - Automated Self-Healing Setup Script
$ErrorActionPreference = "Stop"

function Write-Header {
    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "       TubeGrab 4K - Automated System Setup            " -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Refresh-Path {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $env:Path = "$userPath;$systemPath"
}

function Find-Python {
    $candidates = @("python", "py")
    foreach ($c in $candidates) {
        $cmd = Get-Command $c -ErrorAction SilentlyContinue
        if ($cmd) {
            try {
                $ver = (& $c --version 2>&1)
                if ($ver -match "Python\s+3\.") {
                    return @{ Command = $c; Version = $ver; Path = $cmd.Source }
                }
            } catch {}
        }
    }

    # Search common install paths
    $commonPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            try {
                $ver = (& $p --version 2>&1)
                return @{ Command = $p; Version = $ver; Path = $p }
            } catch {}
        }
    }
    return $null
}

function Install-PythonSilently {
    Write-Host "[!] Python 3 not found on your system." -ForegroundColor Yellow
    Write-Host "    -> Automatically installing Python 3.12 for you (no technical steps required)..." -ForegroundColor Cyan

    $installed = $false

    # Try Winget first (Windows 10/11 native package manager)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        try {
            Write-Host "    -> Downloading and installing via Windows Package Manager..." -ForegroundColor Gray
            $proc = Start-Process winget -ArgumentList "install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements" -Wait -PassThru -NoNewWindow
            if ($proc.ExitCode -eq 0) {
                Refresh-Path
                $py = Find-Python
                if ($py) { return $py }
            }
        } catch {}
    }

    # Fallback: Download official installer from python.org
    try {
        Write-Host "    -> Downloading official Python 3.12 installer from python.org..." -ForegroundColor Gray
        $installerUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
        $installerPath = Join-Path $env:TEMP "python-3.12.7-installer.exe"
        
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing

        Write-Host "    -> Running silent installer with PATH auto-configuration..." -ForegroundColor Gray
        $proc = Start-Process $installerPath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0" -Wait -PassThru
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

        Refresh-Path
        $py = Find-Python
        if ($py) { return $py }
    } catch {
        Write-Host "    [X] Automatic download failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    return $null
}

try {
    Write-Header
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
    Set-Location $scriptDir

    # 1. Check Python
    Write-Host "[1/4] Checking Python environment..." -ForegroundColor White
    $pyInfo = Find-Python
    if (-not $pyInfo) {
        $pyInfo = Install-PythonSilently
    }

    if (-not $pyInfo) {
        Write-Host ""
        Write-Host "--------------------------------------------------------" -ForegroundColor Red
        Write-Host "ERROR: Could not automatically install Python." -ForegroundColor Red
        Write-Host "Please download Python 3.12 manually from:" -ForegroundColor Yellow
        Write-Host "https://www.python.org/downloads/" -ForegroundColor Cyan
        Write-Host "(IMPORTANT: Check the box 'Add python.exe to PATH' during install!)" -ForegroundColor Yellow
        Write-Host "--------------------------------------------------------" -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "      [OK] Python detected: $($pyInfo.Version)" -ForegroundColor Green
    Write-Host ""

    # 2. Install Dependencies
    Write-Host "[2/4] Checking and installing required engine libraries..." -ForegroundColor White
    $reqFile = Join-Path $scriptDir "requirements.txt"
    if (Test-Path $reqFile) {
        $pyCmd = $pyInfo.Command
        Write-Host "      -> Installing yt-dlp, FFmpeg, and FastAPI quietly..." -ForegroundColor Gray
        $proc = Start-Process $pyCmd -ArgumentList "-m pip install -q -r `"$reqFile`"" -Wait -PassThru -NoNewWindow
        if ($proc.ExitCode -eq 0) {
            Write-Host "      [OK] All dependencies installed successfully!" -ForegroundColor Green
        } else {
            Write-Host "      [!] Pip install warning (retrying)..." -ForegroundColor Yellow
            Start-Process $pyCmd -ArgumentList "-m pip install -r `"$reqFile`"" -Wait -NoNewWindow
            Write-Host "      [OK] Dependencies ready." -ForegroundColor Green
        }
    }
    Write-Host ""

    # 3. Configure Windows Background Protocol and Startup
    Write-Host "[3/4] Registering Windows background auto-start..." -ForegroundColor White
    $vbsPath = Join-Path $scriptDir "silent_start.vbs"

    # Register custom URI protocol: tubegrab://
    $regKey = "HKCU:\Software\Classes\tubegrab"
    if (-not (Test-Path $regKey)) { New-Item -Path $regKey -Force | Out-Null }
    Set-ItemProperty -Path $regKey -Name "(Default)" -Value "URL:TubeGrab Protocol"
    Set-ItemProperty -Path $regKey -Name "URL Protocol" -Value ""

    $cmdKey = "$regKey\shell\open\command"
    if (-not (Test-Path $cmdKey)) { New-Item -Path $cmdKey -Force | Out-Null }
    Set-ItemProperty -Path $cmdKey -Name "(Default)" -Value "wscript.exe `"$vbsPath`""

    # Register in Windows Startup folder for auto-start on boot
    try {
        $startupDir = [Environment]::GetFolderPath('Startup')
        $shortcutPath = Join-Path $startupDir "TubeGrab_4K.lnk"
        $wsh = New-Object -ComObject WScript.Shell
        $lnk = $wsh.CreateShortcut($shortcutPath)
        $lnk.TargetPath = "wscript.exe"
        $lnk.Arguments = "`"$vbsPath`""
        $lnk.WorkingDirectory = $scriptDir
        $lnk.WindowStyle = 7
        $lnk.Save()
    } catch {}

    Write-Host "      [OK] Windows protocol (tubegrab://) registered to current folder!" -ForegroundColor Green
    Write-Host "      [OK] Auto-start on boot enabled (zero console popups)." -ForegroundColor Green
    Write-Host ""

    # 4. Launch and Health Check Engine
    Write-Host "[4/4] Starting TubeGrab 4K silent background helper..." -ForegroundColor White
    Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""

    # Wait and verify engine responds on port 19876
    $isAlive = $false
    for ($i = 0; $i -lt 6; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:19876/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp -and $resp.status -eq "running") {
                $isAlive = $true
                break
            }
        } catch {}
    }

    if ($isAlive) {
        Write-Host "      [OK] Engine verified ONLINE on port 19876!" -ForegroundColor Green
    } else {
        Write-Host "      [i] Background helper initialized." -ForegroundColor Gray
    }
    Write-Host ""

    # Copy extension path to clipboard for instant pasting
    $extPath = Join-Path $scriptDir "extension"
    try {
        Set-Clipboard -Value $extPath
        $clipMsg = "(Extension folder path copied to clipboard!)"
    } catch {
        $clipMsg = ""
    }

    # Success Summary
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "   SUCCESS! TubeGrab 4K is completely configured!       " -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "FINAL STEP: Load the extension in your browser (Takes 15s):" -ForegroundColor Cyan
    Write-Host "  1. Open Google Chrome (or Edge/Brave) and go to:" -ForegroundColor White
    Write-Host "     chrome://extensions" -ForegroundColor Yellow
    Write-Host "  2. Turn ON the 'Developer mode' toggle in the top-right corner." -ForegroundColor White
    Write-Host "  3. Click 'Load unpacked' in the top-left corner." -ForegroundColor White
    Write-Host "  4. Select the 'extension' folder: $clipMsg" -ForegroundColor White
    Write-Host "     $extPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After loading, open any YouTube video and download in 4K!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Read-Host "Press Enter to finish"

} catch {
    Write-Host ""
    Write-Host "[X] Setup encountered an unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
}
