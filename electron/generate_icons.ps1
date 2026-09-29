Add-Type -AssemblyName System.Drawing

function Create-AppIcon {
    param (
        [int]$size,
        [string]$outputPath
    )
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Dark background circle
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 18, 18, 20))
    $g.FillEllipse($bgBrush, 1, 1, ($size - 2), ($size - 2))

    # Violet / Purple ring
    $borderWidth = [Math]::Max(2, [int]($size * 0.08))
    $purplePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 147, 51, 234)), $borderWidth
    $offset = [int]($borderWidth / 2) + 1
    $g.DrawEllipse($purplePen, $offset, $offset, ($size - 2 * $offset), ($size - 2 * $offset))

    # White play triangle
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $p1 = New-Object System.Drawing.PointF ($size * 0.38), ($size * 0.28)
    $p2 = New-Object System.Drawing.PointF ($size * 0.72), ($size * 0.50)
    $p3 = New-Object System.Drawing.PointF ($size * 0.38), ($size * 0.72)
    $g.FillPolygon($whiteBrush, @($p1, $p2, $p3))

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $outputPath ($size x $size)"
}

Create-AppIcon -size 32 -outputPath "electron\tray_icon.png"
Create-AppIcon -size 256 -outputPath "electron\icon.png"
