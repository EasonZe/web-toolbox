declare module "cloudflare:sockets" {
  type SocketAddress = { hostname: string; port: number };
  type SocketOptions = {
    secureTransport?: "off" | "on" | "starttls";
    allowHalfOpen?: boolean;
  };
  type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    closed: Promise<void>;
    close(): Promise<void>;
  };
  export function connect(address: SocketAddress, options?: SocketOptions): Socket;
}
