param(
    [string]$ContainerName = "plotarmor-db",
    [string]$PostgresImage = "postgres:16"
)

$envPath = Join-Path (Join-Path $PSScriptRoot "..") ".env.local"

if (-not (Test-Path $envPath)) {
    Write-Error ".env.local not found at $envPath. Create it with DATABASE_URL=postgres://user:password@localhost:5432/dbname"
    exit 1
}

$databaseUrl = $null
foreach ($line in Get-Content $envPath) {
    if ($line -match "^DATABASE_URL=(.+)$") {
        $databaseUrl = $Matches[1].Trim('"').Trim("'")
        break
    }
}

if (-not $databaseUrl) {
    Write-Error "DATABASE_URL not found in .env.local"
    exit 1
}

try {
    $uri = [Uri]$databaseUrl
    $userInfo = $uri.UserInfo -split ":", 2
    $dbUser     = [Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = [Uri]::UnescapeDataString($userInfo[1])
    $dbHost     = $uri.Host
    $dbPort     = if ($uri.Port -eq -1) { 5432 } else { $uri.Port }
    $dbName     = $uri.AbsolutePath.TrimStart("/")
} catch {
    Write-Error "Could not parse DATABASE_URL. Expected format: postgres://user:password@localhost:5432/dbname"
    exit 1
}

if ($dbHost -notin @("localhost", "127.0.0.1")) {
    Write-Warning "DATABASE_URL points to '$dbHost' - this script is for local Docker only. Continuing anyway."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker not found in PATH. Install Docker Desktop and make sure it is running, then try again."
    exit 1
}

$existing = docker ps -a --filter "name=^${ContainerName}$" --format "{{.Names}}"
$running  = docker ps    --filter "name=^${ContainerName}$" --format "{{.Names}}"

if ($running -eq $ContainerName) {
    Write-Host "[$ContainerName] already running on port $dbPort."
} elseif ($existing -eq $ContainerName) {
    Write-Host "[$ContainerName] starting existing container..."
    docker start $ContainerName | Out-Null
    Write-Host "[$ContainerName] started - postgres://$dbUser@${dbHost}:${dbPort}/$dbName"
} else {
    Write-Host "[$ContainerName] creating new container from $PostgresImage..."
    docker run `
        --name $ContainerName `
        -e POSTGRES_USER=$dbUser `
        -e POSTGRES_PASSWORD=$dbPassword `
        -e POSTGRES_DB=$dbName `
        -p "${dbPort}:5432" `
        -d $PostgresImage | Out-Null
    Write-Host "[$ContainerName] created and started - postgres://$dbUser@${dbHost}:${dbPort}/$dbName"
}
