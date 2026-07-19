param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,
  [int]$Port = 18181,
  [string]$AllowedOrigin = 'https://apps.noch.cloud'
)

$ErrorActionPreference = 'Stop'
$agentLogPath = Join-Path $env:ProgramData 'NochPrintAgent\agent.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $agentLogPath) -Force | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class NochRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
  }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
  static extern int StartDocPrinter(IntPtr printer, int level, [In] DOC_INFO_1 docInfo);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

  public static void Send(string printerName, byte[] data, string documentName) {
    IntPtr printer;
    if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
      throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to open Windows printer");

    IntPtr unmanaged = IntPtr.Zero;
    bool documentStarted = false;
    bool pageStarted = false;
    try {
      var info = new DOC_INFO_1 { pDocName = documentName, pDatatype = "RAW" };
      if (StartDocPrinter(printer, 1, info) == 0)
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start RAW print job");
      documentStarted = true;
      if (!StartPagePrinter(printer))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start print page");
      pageStarted = true;

      unmanaged = Marshal.AllocCoTaskMem(data.Length);
      Marshal.Copy(data, 0, unmanaged, data.Length);
      int written;
      if (!WritePrinter(printer, unmanaged, data.Length, out written) || written != data.Length)
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows did not accept the complete print job");
    }
    finally {
      if (unmanaged != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanaged);
      if (pageStarted) EndPagePrinter(printer);
      if (documentStarted) EndDocPrinter(printer);
      ClosePrinter(printer);
    }
  }
}
'@

function Write-AgentLog([string]$message) {
  $line = '{0:u} {1}' -f (Get-Date), $message
  Add-Content -LiteralPath $agentLogPath -Value $line
}

function Test-PrinterAvailable {
  return [bool](Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $PrinterName })
}

function Set-CorsHeaders($response, [string]$origin) {
  if ($origin -eq $AllowedOrigin) {
    $response.Headers['Access-Control-Allow-Origin'] = $AllowedOrigin
    $response.Headers['Vary'] = 'Origin'
  }
  $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Noch-Print-Agent'
  $response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $response.Headers['Private-Network-Access-Name'] = 'Noch Bloom Print Agent'
  $response.Headers['Private-Network-Access-ID'] = 'noch-bloom-print-agent'
}

function Send-Json($context, [int]$statusCode, $body) {
  $json = $body | ConvertTo-Json -Compress -Depth 5
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode = $statusCode
  $context.Response.ContentType = 'application/json; charset=utf-8'
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.OutputStream.Close()
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-AgentLog "Started for printer '$PrinterName' on port $Port"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $origin = $context.Request.Headers['Origin']
    Set-CorsHeaders $context.Response $origin

    try {
      if ($origin -and $origin -ne $AllowedOrigin) {
        Send-Json $context 403 @{ error = 'Origin not allowed' }
        continue
      }

      if ($context.Request.HttpMethod -eq 'OPTIONS') {
        $context.Response.StatusCode = 204
        $context.Response.Close()
        continue
      }

      $path = $context.Request.Url.AbsolutePath
      if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/health') {
        Send-Json $context 200 @{
          ok = $true
          printer = $PrinterName
          printer_available = (Test-PrinterAvailable)
          model = 'XP-N200L'
        }
        continue
      }

      if ($context.Request.HttpMethod -eq 'POST' -and $path -eq '/print') {
        if ($context.Request.Headers['X-Noch-Print-Agent'] -ne '1') {
          Send-Json $context 400 @{ error = 'Missing agent header' }
          continue
        }
        if (-not (Test-PrinterAvailable)) {
          Send-Json $context 503 @{ error = "Windows printer not found: $PrinterName" }
          continue
        }
        $reader = [IO.StreamReader]::new($context.Request.InputStream, $context.Request.ContentEncoding)
        $body = $reader.ReadToEnd() | ConvertFrom-Json
        $data = [Convert]::FromBase64String([string]$body.data_base64)
        if ($data.Length -eq 0 -or $data.Length -gt 1048576) {
          Send-Json $context 400 @{ error = 'Invalid print payload size' }
          continue
        }
        [NochRawPrinter]::Send($PrinterName, $data, 'Noch Bloom POS')
        Write-AgentLog "Printed $($data.Length) raw bytes"
        Send-Json $context 200 @{ ok = $true; bytes = $data.Length }
        continue
      }

      Send-Json $context 404 @{ error = 'Not found' }
    }
    catch {
      Write-AgentLog "ERROR: $($_.Exception.Message)"
      if ($context.Response.OutputStream.CanWrite) {
        Send-Json $context 500 @{ error = $_.Exception.Message }
      }
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
  Write-AgentLog 'Stopped'
}
