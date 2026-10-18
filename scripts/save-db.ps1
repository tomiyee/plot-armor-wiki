# Save the local Docker Postgres database to a SQL dump file.
#
# Usage:
#   .\scripts\save-db.ps1 [[-OutputFile] <path>] [[-ContainerName] <name>]
#
# Defaults:
#   OutputFile     - db-snapshots\YYYY-MM-DD_HH-MM-SS.sql  (under repo root)
#   ContainerName  - plotarmor-db
#
# The script reads DEV_DATABASE_URL (or DATABASE_URL) from .env.local to determine the database name
# and credentials, then runs pg_dump inside the running Docker container.

param(
    [string]$OutputFile    = "",
    [string]$ContainerName = "plotarmor-db"
)

$ErrorActionPreference = "Stop"

$repoRoot  = Join-Path $PSScriptRoot ".."
$envPath   = Join-Path $repoRoot ".env.local"
$snapshotDir = Join-Path $repoRoot "db-snapshots"

if (-not $OutputFile) {
    $timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $OutputFile = Join-Path $snapshotDir "$timestamp.sql"
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

# ── Dump ──────────────────────────────────────────────────────────────────────

$outputDir = Split-Path $OutputFile -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "[$ContainerName] dumping database '$dbName' -> $OutputFile ..."

$env:PGPASSWORD = $dbPassword
docker exec `
    -e "PGPASSWORD=$dbPassword" `
    $ContainerName `
    pg_dump `
        "--username=$dbUser" `
        "--dbname=$dbName" `
        "--no-owner" `
        "--no-acl" `
        "--format=plain" `
| Set-Content -Path $OutputFile -Encoding UTF8

$size = (Get-Item $OutputFile).Length
$sizeKb = [math]::Round($size / 1KB, 1)
Write-Host "[$ContainerName] saved (${sizeKb}K) -> $OutputFile"
