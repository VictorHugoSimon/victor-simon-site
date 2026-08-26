param(
  [string]$Repo = 'VictorHugoSimon/victor-simon-site'
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando '$Name' não encontrado. Instale o GitHub CLI (gh) e tente novamente."
  }
}

Require-Command 'gh'

Write-Host 'Victor Hugo Growth OS — configuração isolada do Cloudflare' -ForegroundColor Cyan
Write-Host "Repositório: $Repo"
Write-Host 'Este script NÃO usa nem altera recursos de outros projetos.' -ForegroundColor Yellow
Write-Host ''

gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI não está autenticado. Execute: gh auth login'
}

$secure = Read-Host 'Cole o CLOUDFLARE_API_TOKEN exclusivo deste projeto' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'Token vazio.' }

  foreach ($environment in @('staging', 'production')) {
    Write-Host "Cadastrando CLOUDFLARE_API_TOKEN em $environment..."
    $token | gh secret set CLOUDFLARE_API_TOKEN --env $environment --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw "Falha ao cadastrar token em $environment." }
  }
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $token = $null
  $secure = $null
}

Write-Host ''
Write-Host 'Token cadastrado nos environments staging e production.' -ForegroundColor Green
Write-Host 'Disparando primeiro o Deploy STAGING...'
gh workflow run deploy-staging.yml --repo $Repo --ref staging
if ($LASTEXITCODE -ne 0) { throw 'Falha ao disparar Deploy STAGING.' }

Write-Host ''
Write-Host 'Concluído. Volte ao ChatGPT e escreva: TOKEN CADASTRADO, CONTINUE.' -ForegroundColor Green
Write-Host 'A produção não é disparada por este script antes da validação do STAGING.'
