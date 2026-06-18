param(
  [string]$RepoName = "fitbazaar",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is not installed. Install it from https://cli.github.com/ and rerun this script."
}

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

git config user.name "Codex"
git config user.email "codex@local"

$status = git status --porcelain
if ($status) {
  git add .
  git commit -m "Prepare FitBazaar for GitHub Pages sharing"
}

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Opening GitHub login. Complete the browser/device login once, then this script will continue."
  gh auth login --hostname github.com --git-protocol https --web
}

$existingRemote = git remote get-url origin 2>$null
if (-not $existingRemote) {
  $repoExists = $false
  gh repo view $RepoName *> $null
  if ($LASTEXITCODE -eq 0) {
    $repoExists = $true
  }

  if ($repoExists) {
    $repoUrl = gh repo view $RepoName --json url --jq ".url"
    git remote add origin $repoUrl
  } else {
    gh repo create $RepoName "--$Visibility" --source "." --remote origin --push
  }
} else {
  git push -u origin main
}

$owner = gh api user --jq ".login"
$repoUrl = gh repo view --json url --jq ".url"
$pagesUrl = "https://$owner.github.io/$RepoName/"

Write-Host ""
Write-Host "GitHub repo:"
Write-Host $repoUrl
Write-Host ""
Write-Host "GitHub Pages link, available after the Actions deploy finishes:"
Write-Host $pagesUrl
Write-Host ""
Write-Host "If Pages does not appear after a few minutes, open the repo Settings -> Pages and choose GitHub Actions."
