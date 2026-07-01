export interface InboundMessage {
  barberPhone: string;
  text: string;
}

export interface OutboundMessage {
  text: string;
  /** Link wa.me opzionale (es. promemoria pronto) */
  waMeLink?: string;
}

export interface MessageSender {
  send(toBarberPhone: string, message: OutboundMessage): Promise<void>;
}

/** In dev restituisce i messaggi nella risposta HTTP invece di inviarli. */
export class DevMessageCollector implements MessageSender {
  readonly messages: OutboundMessage[] = [];

  async send(_toBarberPhone: string, message: OutboundMessage): Promise<void> {
    this.messages.push(message);
  }
}
