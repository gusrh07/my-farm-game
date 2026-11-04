$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path $PSScriptRoot '../assets-source/extracted'
$outputRoot = Join-Path $PSScriptRoot '../public/assets/sunnyside'
[System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Tileset/spr_tileset_sunnysideworld_16px.png') -Destination (Join-Path $outputRoot 'tiles.png')
foreach ($crop in @('radish','potato','wheat','pumpkin')) {
  foreach ($stage in 0..5) {
    $name = '{0}_{1:00}.png' -f $crop,$stage
    Copy-Item -LiteralPath (Join-Path $sourceRoot "Elements/Crops/$name") -Destination (Join-Path $outputRoot $name)
  }
}
foreach ($name in @('soil_00','soil_01','soil_03','soil_04','seeds_generic')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot "Elements/Crops/$name.png") -Destination (Join-Path $outputRoot "$name.png")
}
foreach ($name in @('shovel','water','plant','basket')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot "UI/$name.png") -Destination (Join-Path $outputRoot "icon-$name.png")
}
Add-Type -AssemblyName System.Drawing
$preview = [System.Drawing.Bitmap]::new(800,400)
$g = [System.Drawing.Graphics]::FromImage($preview)
$g.Clear([System.Drawing.Color]::FromArgb(80,90,75))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$font = [System.Drawing.Font]::new('Arial',10)
$files = Get-ChildItem $outputRoot -Filter '*.png' | Where-Object { $_.Name -notmatch 'tiles|character' }
$i = 0
foreach ($file in $files) {
  $img = [System.Drawing.Image]::FromFile($file.FullName)
  $x = ($i % 10)*80
  $y = [Math]::Floor($i/10)*100
  $g.DrawImage($img, [int]$x, [int]$y, [int]($img.Width*2), [int]($img.Height*2))
  $g.DrawString($file.BaseName,$font,[System.Drawing.Brushes]::White,[single]$x,[single]($y+75))
  Write-Output "$($file.Name): $($img.Width)x$($img.Height)"
  $img.Dispose()
  $i++
}
$preview.Save((Join-Path $PSScriptRoot '../assets-source/crops-preview.png'))
$font.Dispose(); $g.Dispose(); $preview.Dispose()
