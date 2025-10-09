
export const blobToBase64 = (blob: Blob): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix e.g. "data:image/jpeg;base64,"
        resolve(reader.result.split(',')[1]);
      } else {
        resolve(null);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
