#Requires -Version 7
<#
  Deploys the 2048 game to AWS.

  1. Creates or updates the CloudFormation stack (S3 bucket + CloudFront).
  2. Uploads index.html to the bucket.
  3. Invalidates the CloudFront cache so the new page is served right away.

  Usage: pwsh infra/deploy.ps1 [-StackName game-2048] [-Profile jt] [-Region us-east-1]
#>
[CmdletBinding()]
param(
  [string]$StackName = 'game-2048',
  [string]$Profile = 'jt',
  [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $PSScriptRoot 'template.yaml'
$page = Join-Path $root 'index.html'

$awsCmd = Get-Command aws -ErrorAction SilentlyContinue
if ($awsCmd) {
  $aws = $awsCmd.Source
} else {
  $aws = Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2\aws.exe'
  if (-not (Test-Path $aws)) { throw 'AWS CLI v2 not found. Install it or add it to PATH.' }
}

Write-Host "Deploying stack '$StackName' in $Region with profile '$Profile'..."
& $aws cloudformation deploy `
  --template-file $template `
  --stack-name $StackName `
  --profile $Profile --region $Region `
  --no-fail-on-empty-changeset
if ($LASTEXITCODE -ne 0) { throw 'CloudFormation deploy failed.' }

$outputs = & $aws cloudformation describe-stacks `
  --stack-name $StackName --profile $Profile --region $Region `
  --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
$bucket = ($outputs | Where-Object OutputKey -eq 'BucketName').OutputValue
$distId = ($outputs | Where-Object OutputKey -eq 'DistributionId').OutputValue
$url = ($outputs | Where-Object OutputKey -eq 'SiteUrl').OutputValue

Write-Host "Uploading index.html to s3://$bucket/ ..."
& $aws s3 cp $page "s3://$bucket/index.html" `
  --content-type 'text/html; charset=utf-8' `
  --cache-control 'public, max-age=300' `
  --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { throw 'Upload to S3 failed.' }

Write-Host "Invalidating CloudFront cache on $distId ..."
$invalidation = & $aws cloudfront create-invalidation `
  --distribution-id $distId --paths '/*' `
  --profile $Profile --region $Region `
  --query 'Invalidation.Id' --output text
if ($LASTEXITCODE -ne 0) { throw 'CloudFront invalidation failed.' }

Write-Host "Invalidation $invalidation submitted."
Write-Host ''
Write-Host "Site: $url"
