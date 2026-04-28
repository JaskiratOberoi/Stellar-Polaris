# Called from NSIS customInstall; expects STELLAR_INSTALL_DATA_DIR and STELLAR_INSTALL_LOGS_DIR.
$d = $env:STELLAR_INSTALL_DATA_DIR
$l = $env:STELLAR_INSTALL_LOGS_DIR
if (-not $d -or -not $l) { exit 1 }
$p = [IO.Path]::Combine($env:APPDATA, 'Stellar Polaris', 'config.json')
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p)) | Out-Null
$o = @{ dataDir = $d; logsDir = $l; port = 4400 } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($p, $o)
