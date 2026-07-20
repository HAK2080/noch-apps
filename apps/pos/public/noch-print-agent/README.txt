NOCH BLOOM — XP-N200L WINDOWS USB SETUP

1. Install the official XPrinter Windows driver and connect the XP-N200L by USB.
2. Confirm a Windows test page prints successfully.
3. Connect the 24V cash drawer to the printer's drawer port (not to the PC).
4. Open "Noch-Bloom-Printer-Setup.exe" and click Yes when Windows asks for permission.

   If the automatic printer detection cannot find XP-N200L, use the legacy ZIP
   and ask a manager to run:

   powershell -ExecutionPolicy Bypass -File .\Install-NochPrintAgent.ps1 -PrinterName "EXACT WINDOWS PRINTER NAME"

7. In apps.noch.cloud open Bloom POS > Settings > Printer Setup.
8. Select Windows USB, connect, then run Test Print and Test Open Drawer.
9. Enable "This PC is the print host" only on the Bloom PC.

This setup is local to Bloom's Windows PC. It does not change the printer or
print-host settings at Noch's other locations.
