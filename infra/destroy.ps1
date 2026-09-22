#Requires -Version 7
<#
  Removes the 2048 game from AWS: empties the site bucket, then deletes the
  CloudFormation stack (bucket, bucket policy, origin access control and
  CloudFront distribution).

  Usage: pwsh infra/destroy.ps1 [-StackName game-2048] [-Profile jt] [-Region us-east-1]
#>
[CmdletBinding()]
param(
  [string]$StackName = 'game-2048',
  [string]$Profile = 'jt',
  [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'

$awsCmd = Get-Command aws -ErrorAction SilentlyContinue
if ($awsCmd) {
  $aws = $awsCmd.Source
} else {
  $aws = Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2\aws.exe'
  if (-not (Test-Path $aws)) { throw 'AWS CLI v2 not found. Install it or add it to PATH.' }
}

$bucket = & $aws cloudformation describe-stacks `
  --stack-name $StackName --profile $Profile --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" --output text
if ($LASTEXITCODE -ne 0 -or -not $bucket -or $bucket -eq 'None') { throw "Stack '$StackName' not found or has no bucket output." }

Write-Host "Emptying s3://$bucket ..."
& $aws s3 rm "s3://$bucket" --recursive --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { throw 'Emptying the bucket failed.' }

Write-Host "Deleting stack '$StackName' (CloudFront disable and delete takes several minutes)..."
& $aws cloudformation delete-stack --stack-name $StackName --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { throw 'delete-stack failed.' }
& $aws cloudformation wait stack-delete-complete --stack-name $StackName --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { throw 'Stack deletion did not complete. Check the CloudFormation console.' }

Write-Host "Stack '$StackName' deleted."
