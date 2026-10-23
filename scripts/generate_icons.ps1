$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class IconGenerator
{
    public static void GenerateIcon(int size, string path)
    {
        using (Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            float s = size / 128f;

            // Rounded Shield Background
            using (GraphicsPath shield = new GraphicsPath())
            {
                PointF[] points = new PointF[] {
                    new PointF(64f * s, 10f * s),
                    new PointF(112f * s, 26f * s),
                    new PointF(112f * s, 72f * s),
                    new PointF(64f * s, 118f * s),
                    new PointF(16f * s, 72f * s),
                    new PointF(16f * s, 26f * s)
                };
                
                shield.AddBezier(points[0], new PointF(88f * s, 16f * s), new PointF(102f * s, 20f * s), points[1]);
                shield.AddBezier(points[1], new PointF(112f * s, 84f * s), new PointF(88f * s, 104f * s), points[3]);
                shield.AddBezier(points[3], new PointF(40f * s, 104f * s), new PointF(16f * s, 84f * s), points[4]);
                shield.AddBezier(points[4], new PointF(26f * s, 20f * s), new PointF(40f * s, 16f * s), points[0]);
                shield.CloseFigure();

                // Vibrant Gradient: Modern Ruby / Crimson Red
                RectangleF rect = new RectangleF(0, 0, size, size);
                using (LinearGradientBrush brush = new LinearGradientBrush(rect, Color.FromArgb(255, 235, 30, 60), Color.FromArgb(255, 165, 10, 40), 55f))
                {
                    g.FillPath(brush, shield);
                }

                // Inner rim border
                using (Pen pen = new Pen(Color.FromArgb(200, 255, 255, 255), Math.Max(1.2f, 3f * s)))
                {
                    g.DrawPath(pen, shield);
                }
            }

            // White Play symbol
            using (GraphicsPath play = new GraphicsPath())
            {
                PointF[] triangle = new PointF[] {
                    new PointF(48f * s, 42f * s),
                    new PointF(82f * s, 64f * s),
                    new PointF(48f * s, 86f * s)
                };
                play.AddPolygon(triangle);
                using (SolidBrush whiteBrush = new SolidBrush(Color.White))
                {
                    g.FillPath(whiteBrush, play);
                }
            }

            // Lightning / Skip bolt across the play icon
            using (GraphicsPath bolt = new GraphicsPath())
            {
                PointF[] boltPts = new PointF[] {
                    new PointF(76f * s, 36f * s),
                    new PointF(62f * s, 58f * s),
                    new PointF(72f * s, 58f * s),
                    new PointF(54f * s, 92f * s),
                    new PointF(82f * s, 56f * s),
                    new PointF(72f * s, 56f * s)
                };
                bolt.AddPolygon(boltPts);
                using (SolidBrush yellowBrush = new SolidBrush(Color.FromArgb(255, 255, 225, 50)))
                {
                    g.FillPath(yellowBrush, bolt);
                }
                using (Pen darkPen = new Pen(Color.FromArgb(180, 0, 0, 0), Math.Max(1f, 1.5f * s)))
                {
                    g.DrawPolygon(darkPen, boltPts);
                }
            }

            bmp.Save(path, ImageFormat.Png);
        }
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies "System.Drawing"
[IconGenerator]::GenerateIcon(16, "d:\youtube\icons\icon16.png")
[IconGenerator]::GenerateIcon(32, "d:\youtube\icons\icon32.png")
[IconGenerator]::GenerateIcon(48, "d:\youtube\icons\icon48.png")
[IconGenerator]::GenerateIcon(128, "d:\youtube\icons\icon128.png")
Write-Host "All icons generated successfully!"
