using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Windows.Forms;

internal static class NochBloomPrinterInstaller
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            if (!IsAdministrator())
            {
                RestartAsAdministrator();
                return;
            }

            InstallAgent();
            MessageBox.Show(
                "Bloom printer setup is complete.\n\nReturn to Bloom POS, select Windows USB, then click Connect Windows USB Printer.",
                "Noch Bloom Printer Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Win32Exception error)
        {
            var message = error.NativeErrorCode == 1223
                ? "Administrator approval was cancelled. Run the installer again and click Yes."
                : error.Message;
            ShowError(message);
        }
        catch (Exception error)
        {
            ShowError(error.Message);
        }
    }

    private static bool IsAdministrator()
    {
        using (var identity = WindowsIdentity.GetCurrent())
        {
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    private static void RestartAsAdministrator()
    {
        var start = new ProcessStartInfo
        {
            FileName = Application.ExecutablePath,
            UseShellExecute = true,
            Verb = "runas"
        };
        Process.Start(start);
    }

    private static void InstallAgent()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "NochBloomPrinter-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        try
        {
            var agentPath = Path.Combine(tempDir, "Noch-PrintAgent.ps1");
            var installerPath = Path.Combine(tempDir, "Install-NochPrintAgent.ps1");
            ExtractResource("NochPrintAgent.ps1", agentPath);
            ExtractResource("InstallNochPrintAgent.ps1", installerPath);

            var start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + installerPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using (var process = Process.Start(start))
            {
                var output = process.StandardOutput.ReadToEnd();
                var error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    var detail = string.IsNullOrWhiteSpace(error) ? output : error;
                    throw new InvalidOperationException(
                        "Setup could not connect the XP-N200L. Confirm that a Windows test page prints, then run setup again.\n\n" +
                        TrimDetail(detail));
                }
            }
        }
        finally
        {
            try { Directory.Delete(tempDir, true); }
            catch { }
        }
    }

    private static void ExtractResource(string resourceName, string destination)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using (var source = assembly.GetManifestResourceStream(resourceName))
        {
            if (source == null) throw new InvalidOperationException("Installer resource is missing: " + resourceName);
            using (var target = File.Create(destination)) source.CopyTo(target);
        }
    }

    private static string TrimDetail(string detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return "No further details were returned by Windows.";
        detail = detail.Trim();
        return detail.Length <= 1400 ? detail : detail.Substring(detail.Length - 1400);
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(
            message,
            "Noch Bloom Printer Setup",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }
}
