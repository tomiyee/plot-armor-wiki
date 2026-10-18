# Restore the local Docker Postgres database from a SQL dump file.
#
# Usage:
#   .\scripts\load-db.ps1 -InputFile <path> [[-ContainerName] <name>] [-Force]
#
# Arguments:
#   -InputFile     - path to a .sql dump produced by save-db.ps1 (required)
#   -ContainerName - Docker container name (default: plotarmor-db)
#   -Force         - skip the confirmation prompt
#
# WARNING: This drops and recreates the target database.  All existing data
#          will be permanently deleted.

param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [string]$ContainerName = "plotarmor-db",

    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Join-Path $PSScriptRoot ".."
$envPath  = Join-Path $repoRoot ".env.local"

# ── Validate input file ───────────────────────────────────────────────────────

if (-not (Test-Path $InputFile)) {
    Write-Error "File not found: $InputFile"
    exit 1
}

# ── Read .env.local ──────────────────────────────────────────────────────────

if (-not (Test-Path $envPath)) {
    Write-Error ".env.local not found at $envPath. Create it with DATABASE_URL=postgres://user:password@localhost:5432/dbname"
    exit 1
}

$databaseUrl = $null
# Local scripts target the dev database: prefer DEV_DATABASE_URL, fall back to DATABASE_URL.
foreach ($key in @("DEV_DATABASE_URL", "DATABASE_URL")) {
    foreach ($line in Get-Content $envPath) {
        if ($line -match "^$key=(.+)$") {
            $databaseUrl = $Matches[1].Trim('"').Trim("'")
            break
        }
    }
    if ($databaseUrl) { break }
}

if (-not $databaseUrl) {
    Write-Error "Neither DEV_DATABASE_URL nor DATABASE_URL found in .env.local"
    exit 1
}

# ── Parse connection string ───────────────────────────────────────────────────

try {
    $uri        = [Uri]$databaseUrl
    $userInfo   = $uri.UserInfo -split ":", 2
    $dbUser     = [Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = [Uri]::UnescapeDataString($userInfo[1])
    $dbName     = $uri.AbsolutePath.TrimStart("/") -replace "\?.*$", ""
} catch {
    Write-Error "Could not parse DATABASE_URL. Expected format: postgres://user:password@localhost:5432/dbname"
    exit 1
}

# ── Check Docker ──────────────────────────────────────────────────────────────

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker not found in PATH. Install Docker Desktop and make sure it is running, then try again."
    exit 1
}

$running = docker ps --filter "name=^${ContainerName}$" --format "{{.Names}}"
if ($running -ne $ContainerName) {
    Write-Error "Container '$ContainerName' is not running. Start it first with .\scripts\start-db.ps1"
    exit 1
}

# ── Confirmation ──────────────────────────────────────────────────────────────

if (-not $Force) {
    Write-Host "WARNING: This will drop and recreate '$dbName' in container '$ContainerName'."
    Write-Host "         All existing data will be permanently deleted."
    Write-Host ""
    $confirm = Read-Host "Type 'yes' to continue"
    if ($confirm -ne "yes") {
        Write-Host "aborted."
        exit 0
    }
}

# ── Restore ───────────────────────────────────────────────────────────────────

Write-Host "[$ContainerName] dropping and recreating database '$dbName' ..."

docker exec `
    -e "PGPASSWORD=$dbPassword" `
    $ContainerName `
    psql `
        "--username=$dbUser" `
        "--dbname=postgres" `
        -c "DROP DATABASE IF EXISTS `"$dbName`";" `
        -c "CREATE DATABASE `"$dbName`";" `
| Out-Null

Write-Host "[$ContainerName] loading $InputFile ..."

Get-Content -Path $InputFile -Raw | docker exec -i `
    -e "PGPASSWORD=$dbPassword" `
    $ContainerName `
    psql `
        "--username=$dbUser" `
        "--dbname=$dbName"

Write-Host "[$ContainerName] database '$dbName' restored from $InputFile"
