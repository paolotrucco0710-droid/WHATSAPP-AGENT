/** Payload in ingresso — testo o contatto condiviso WhatsApp */
export interface SharedContact {
  name: string;
  phone: string;
}

export interface InboundMessage {
  barberPhone: string;
  text?: string;
  contact?: SharedContact;
}
