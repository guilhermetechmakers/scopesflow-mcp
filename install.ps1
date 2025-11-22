# ScopesFlow MCP Server - Windows PowerShell Installer
# Cursor Agent Installer for Windows

# Set error action preference to stop on errors
$ErrorActionPreference = "Stop"

# Color definitions for output
function Write-Step {
    param([string]$Message)
    Write-Host "▸ $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Header {
    param([string]$Message)
    Write-Host "`n$Message`n" -ForegroundColor Cyan -NoNewline
    Write-Host ""
}

# Fancy header
Write-Host ""
Write-Host "Cursor Agent Installer" -ForegroundColor Cyan
Write-Host ""

# Detect OS and Architecture
Write-Step "Detecting system architecture..."

# Detect Architecture
$Arch = $env:PROCESSOR_ARCHITECTURE
switch ($Arch) {
    "AMD64" { $Arch = "x64" }
    "ARM64" { $Arch = "arm64" }
    default {
        Write-Error "Unsupported architecture: $Arch"
        exit 1
    }
}

$OS = "win32"
Write-Success "Detected $OS/$Arch"

# Installation steps
Write-Step "Creating installation directory..."

# Create installation directory path
$InstallBaseDir = "$env:LOCALAPPDATA\cursor-agent"
$VersionString = "2025.09.18-7ae6800"
$TempExtractDir = "$InstallBaseDir\versions\.tmp-$VersionString-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Create temporary directory
New-Item -ItemType Directory -Force -Path $TempExtractDir | Out-Null
Write-Success "Directory created"

# Download URL
Write-Step "Downloading Cursor Agent package..."
$DownloadUrl = "https://downloads.cursor.com/lab/$VersionString/$OS/$Arch/agent-cli-package.tar.gz"
Write-Host "  Download URL: $DownloadUrl" -ForegroundColor DarkGray

# Download file
$TempArchive = "$env:TEMP\cursor-agent-$VersionString.tar.gz"

try {
    # Download the archive
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempArchive -UseBasicParsing
    Write-Success "Package downloaded"
    
    # Check if tar is available (Windows 10 1803+ has built-in tar)
    Write-Step "Extracting package..."
    
    if (Get-Command tar -ErrorAction SilentlyContinue) {
        # Use built-in tar command
        tar -xzf $TempArchive -C $TempExtractDir --strip-components=1
        Write-Success "Package extracted"
    } else {
        Write-Error "tar command not found. Please ensure you're running Windows 10 version 1803 or later."
        throw "tar command required"
    }
} catch {
    Write-Error "Download or extraction failed: $_"
    Write-Error "Please check your internet connection and try again."
    # Cleanup
    if (Test-Path $TempArchive) {
        Remove-Item $TempArchive -Force
    }
    if (Test-Path $TempExtractDir) {
        Remove-Item $TempExtractDir -Recurse -Force
    }
    exit 1
} finally {
    # Remove temp archive
    if (Test-Path $TempArchive) {
        Remove-Item $TempArchive -Force
    }
}

# Move to final destination
Write-Step "Finalizing installation..."
$FinalDir = "$InstallBaseDir\versions\$VersionString"

# Remove existing installation if present
if (Test-Path $FinalDir) {
    Remove-Item $FinalDir -Recurse -Force
}

try {
    Move-Item $TempExtractDir $FinalDir
    Write-Success "Package installed successfully"
} catch {
    Write-Error "Failed to install package: $_"
    Write-Error "Please check permissions and try again."
    # Cleanup
    if (Test-Path $TempExtractDir) {
        Remove-Item $TempExtractDir -Recurse -Force
    }
    exit 1
}

# Create bin directory in user's local path
Write-Step "Creating bin directory..."
$BinDir = "$env:LOCALAPPDATA\bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}
Write-Success "Bin directory ready"

# Create a wrapper script for cursor-agent
Write-Step "Creating cursor-agent launcher..."
$CursorAgentExe = "$FinalDir\cursor-agent.exe"
$LauncherPath = "$BinDir\cursor-agent.cmd"

# Create CMD wrapper
@"
@echo off
"$CursorAgentExe" %*
"@ | Out-File -FilePath $LauncherPath -Encoding ASCII

Write-Success "Launcher created"

# Success message
Write-Host ""
Write-Host "✨ Installation Complete! " -ForegroundColor Green
Write-Host ""

# Check if the bin directory is in PATH
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$BinDirInPath = $UserPath -split ';' | Where-Object { $_ -eq $BinDir }

if (-not $BinDirInPath) {
    Write-Host "Next Steps" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Add cursor-agent to your PATH:" -ForegroundColor White
    Write-Host ""
    Write-Host "   Run this command in PowerShell (as Administrator):" -ForegroundColor DarkGray
    Write-Host "   [Environment]::SetEnvironmentVariable('PATH', `$env:PATH + ';$BinDir', 'User')" -ForegroundColor Blue
    Write-Host ""
    Write-Host "   Or manually add this directory to your PATH:" -ForegroundColor DarkGray
    Write-Host "   $BinDir" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Restart your terminal" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Start using Cursor Agent:" -ForegroundColor White
    Write-Host "   cursor-agent" -ForegroundColor Blue
    Write-Host ""
} else {
    Write-Host "Cursor Agent is ready to use!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Start using it with:" -ForegroundColor White
    Write-Host "   cursor-agent" -ForegroundColor Blue
    Write-Host ""
}

Write-Host "Happy coding! 🚀" -ForegroundColor Cyan
Write-Host ""
