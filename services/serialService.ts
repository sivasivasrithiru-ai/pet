
export class SerialService {
  private port: any | null = null;
  private writer: any | null = null;
  private reader: any | null = null;
  private lineBuffer: string = "";

  isSupported(): boolean {
    return 'serial' in navigator;
  }

  async connect(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      // @ts-ignore
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      return true;
    } catch (error) {
      console.error('Connection failed:', error);
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
      // Silent fail on close
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
      await this.writer.write(encoder.encode(cmd + '\n'));
    } catch (error) {
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

        this.lineBuffer += decoder.decode(value, { stream: true });
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) onData(line.trim());
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
