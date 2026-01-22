
export class SerialService {
  private port: any | null = null;
  private writer: any | null = null;
  private reader: any | null = null;
  private lineBuffer: string = "";

  async connect(): Promise<boolean> {
    try {
      // @ts-ignore - navigator.serial is not in standard types yet
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      return true;
    } catch (error) {
      console.error('Serial connection failed:', error);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader.releaseLock();
      }
      if (this.writer) {
        this.writer.releaseLock();
      }
      if (this.port) {
        await this.port.close().catch(() => {});
      }
    } catch (e) {
      console.error('Error during disconnect:', e);
    } finally {
      this.port = null;
      this.writer = null;
      this.reader = null;
      this.lineBuffer = "";
    }
  }

  async sendCommand(cmd: string) {
    if (!this.writer) return;
    try {
      const encoder = new TextEncoder();
      // Commands must end with \n for the ESP32 code to process them
      await this.writer.write(encoder.encode(cmd + '\n'));
    } catch (error) {
      console.error('Write error:', error);
      throw error;
    }
  }

  async readLoop(onData: (data: string) => void, onError: (error: any) => void) {
    if (!this.reader) return;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;

        // Accumulate data and split by lines
        this.lineBuffer += decoder.decode(value, { stream: true });
        const lines = this.lineBuffer.split('\n');
        
        // Keep the last partial line in the buffer
        this.lineBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            onData(trimmedLine);
          }
        }
      }
    } catch (error) {
      onError(error);
    } finally {
      this.disconnect();
    }
  }
}

export const serialService = new SerialService();
