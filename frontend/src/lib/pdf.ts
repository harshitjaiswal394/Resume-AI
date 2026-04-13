import * as mammoth from 'mammoth';

// Set worker source using a more reliable method
export async function extractTextFromFile(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // Use dynamic import for pdfjs-dist to avoid SSR issues
      const pdfjs = await import('pdfjs-dist');
      
      // Configure worker
      if (typeof window !== 'undefined') {
        const version = pdfjs.version || '5.6.205';
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
      }

      const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: true,
        isEvalSupported: false
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .filter((item: any) => 'str' in item)
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      if (!fullText.trim()) {
        throw new Error('PDF appears to be empty or contains only images/scanned content.');
      }

      return fullText;
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (!result.value.trim()) {
        throw new Error('DOCX file appears to be empty.');
      }
      return result.value;
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
    }
  } catch (error: any) {
    console.error('Error extracting text:', error);
    // Fallback or more descriptive error
    if (error.message?.includes('Object.defineProperty')) {
      throw new Error('PDF processing error. Please try a different PDF or convert it to a simpler format.');
    }
    throw new Error(error.message || 'Failed to extract text from file');
  }
}
