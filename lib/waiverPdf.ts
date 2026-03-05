// lib/waiverPdf.ts - Generate professional PDF waivers
// Lazy-load native modules to avoid crashing if native module isn't available at import time
const getPrint = () => require('expo-print') as typeof import('expo-print');
const getSharing = () => require('expo-sharing') as typeof import('expo-sharing');
const getFileSystem = () => require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

interface WaiverData {
  eventTitle: string;
  waiverText: string;
  signerName: string;
  signerEmail: string;
  initials: string;
  signedAt: Date;
  cachedUri?: string; // Optional: reuse existing PDF if available
}

/**
 * Generate a professional HTML template for the waiver PDF
 */
const generateWaiverHTML = (data: WaiverData): string => {
  // Format the date nicely
  const formattedDate = data.signedAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = data.signedAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            padding: 40px;
            color: #1a1a1a;
            line-height: 1.6;
            background: white;
          }

          .container {
            max-width: 700px;
            margin: 0 auto;
            border: 2px solid #1B365D;
            padding: 40px;
            border-radius: 8px;
          }

          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px double #1B365D;
          }

          .logo-text {
            font-size: 28px;
            font-weight: 700;
            color: #1B365D;
            letter-spacing: 1px;
            margin-bottom: 10px;
          }

          .doc-title {
            font-size: 22px;
            font-weight: 700;
            color: #1B365D;
            margin-top: 10px;
            letter-spacing: 1.5px;
          }

          .event-name {
            font-size: 16px;
            color: #666;
            margin-top: 8px;
            font-style: italic;
          }

          .content {
            margin: 30px 0;
          }

          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #1B365D;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 25px 0 15px 0;
            padding-top: 20px;
            border-top: 1px solid #E5E7EB;
          }

          .waiver-text {
            font-size: 13px;
            color: #333;
            line-height: 1.8;
            text-align: justify;
            margin: 15px 0;
            padding: 20px;
            background: #F9FAFB;
            border-left: 4px solid #1B365D;
            border-radius: 4px;
          }

          .signature-section {
            margin-top: 40px;
            padding: 25px;
            background: #F0F4F8;
            border-radius: 8px;
            border: 1px solid #D1D9E6;
          }

          .signature-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #D1D9E6;
          }

          .signature-row:last-child {
            border-bottom: none;
          }

          .signature-label {
            font-size: 13px;
            font-weight: 600;
            color: #666;
          }

          .signature-value {
            font-size: 13px;
            font-weight: 600;
            color: #1a1a1a;
            text-align: right;
          }

          .initials-value {
            font-size: 20px;
            font-weight: 700;
            color: #1B365D;
            letter-spacing: 4px;
          }

          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #E5E7EB;
            text-align: center;
            font-size: 11px;
            color: #999;
          }

          .timestamp {
            margin-top: 10px;
            font-size: 10px;
            color: #aaa;
          }

          .watermark {
            position: fixed;
            bottom: 20px;
            right: 20px;
            font-size: 10px;
            color: #ccc;
            opacity: 0.5;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="logo-text">RALLYSPHERE</div>
            <div class="doc-title">EVENT WAIVER AGREEMENT</div>
            <div class="event-name">${data.eventTitle}</div>
          </div>

          <!-- Waiver Content -->
          <div class="content">
            <div class="section-title">Terms & Conditions</div>
            <div class="waiver-text">
              ${data.waiverText.replace(/\n/g, '<br>')}
            </div>
          </div>

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="section-title" style="border-top: none; margin-top: 0; padding-top: 0;">
              Electronic Signature
            </div>

            <div class="signature-row">
              <div class="signature-label">Full Name:</div>
              <div class="signature-value">${data.signerName}</div>
            </div>

            <div class="signature-row">
              <div class="signature-label">Email Address:</div>
              <div class="signature-value">${data.signerEmail}</div>
            </div>

            <div class="signature-row">
              <div class="signature-label">Initials:</div>
              <div class="signature-value initials-value">${data.initials}</div>
            </div>

            <div class="signature-row">
              <div class="signature-label">Date & Time:</div>
              <div class="signature-value">${formattedDate}<br>${formattedTime}</div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            This document constitutes a legally binding electronic signature.
            <div class="timestamp">
              Document ID: ${data.signerEmail.split('@')[0]}-${data.signedAt.getTime()}
            </div>
          </div>
        </div>

        <div class="watermark">Generated by RallySphere</div>
      </body>
    </html>
  `;
};

/**
 * Generate and share a PDF waiver
 * Returns the PDF URI on success for caching
 * If cachedUri is provided, tries to reuse it instead of regenerating
 */
export const generateAndShareWaiverPDF = async (data: WaiverData): Promise<{ success: boolean; uri?: string; error?: string }> => {
  try {
    // Create a clean filename: "Event Name, First Last Name Waiver.pdf"
    // Remove special characters that might cause issues in filenames
    const cleanEventName = data.eventTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const cleanSignerName = data.signerName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const filename = `${cleanEventName}, ${cleanSignerName} Waiver.pdf`;

    let uri: string;

    // Try to use cached URI if provided (optimization: don't regenerate)
    if (data.cachedUri) {
      uri = data.cachedUri;
    } else {
      // Generate HTML content and create PDF
      const html = generateWaiverHTML(data);
      const Print = getPrint();
      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // Rename the file to have the proper filename
      const directory = result.uri.substring(0, result.uri.lastIndexOf('/') + 1);
      const newUri = directory + filename;

      // Move/rename the file using legacy API
      const { moveAsync } = getFileSystem();
      await moveAsync({
        from: result.uri,
        to: newUri,
      });

      uri = newUri;
    }

    // Share the PDF with the proper filename
    const Sharing = getSharing();
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename.replace('.pdf', ''),
        UTI: 'com.adobe.pdf',
      });
    } else {
      return { success: false, error: 'Sharing is not available on this device' };
    }

    return { success: true, uri };
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Preview a PDF waiver (shows in print preview)
 */
export const previewWaiverPDF = async (data: WaiverData): Promise<{ success: boolean; error?: string }> => {
  try {
    const html = generateWaiverHTML(data);

    const Print = getPrint();
    await Print.printAsync({
      html,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error previewing PDF:', error);
    return { success: false, error: error.message };
  }
};
