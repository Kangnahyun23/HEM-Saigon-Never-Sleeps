/**
 * Hộp tin nhắn trong điện thoại (thuần logic, có unit test): mỗi người một cuộc trò chuyện, đếm tin chưa đọc.
 */

export type Contact = 'Ngân' | 'Chú Sáu' | 'Bà Tư' | 'Phát CEO' | 'Vy' | 'Tổng đài kèo' | 'Vay Liền 5S';

export interface Message {
  from: Contact | 'Tín';
  text: string;
  /** Giờ trong game. */
  hour: number;
}

export interface Thread {
  contact: Contact;
  messages: Message[];
  unread: number;
}

export class Inbox {
  readonly threads: Thread[] = [];
  /** Gọi khi có tin mới từ người khác (để HUD rung / hiện thông báo). */
  onMessage: ((m: Message, contact: Contact) => void) | null = null;

  constructor(data: Thread[] = []) {
    for (const t of data) this.threads.push({ contact: t.contact, messages: [...t.messages], unread: t.unread });
  }

  /** Nạp lại từ bản lưu. */
  restore(data: Thread[]): void {
    this.threads.length = 0;
    for (const t of data) this.threads.push({ contact: t.contact, messages: [...t.messages], unread: t.unread });
  }

  thread(contact: Contact): Thread {
    let t = this.threads.find((x) => x.contact === contact);
    if (!t) {
      t = { contact, messages: [], unread: 0 };
      this.threads.push(t);
    }
    return t;
  }

  /** Tin từ người khác gửi Tín. */
  receive(contact: Contact, text: string, hour = 0): void {
    const t = this.thread(contact);
    const m: Message = { from: contact, text, hour };
    t.messages.push(m);
    t.unread++;
    // Cuộc trò chuyện mới nhất lên đầu.
    this.threads.splice(this.threads.indexOf(t), 1);
    this.threads.unshift(t);
    this.onMessage?.(m, contact);
  }

  /** Tín trả lời. */
  reply(contact: Contact, text: string, hour = 0): void {
    this.thread(contact).messages.push({ from: 'Tín', text, hour });
  }

  markRead(contact: Contact): void {
    this.thread(contact).unread = 0;
  }

  get unread(): number {
    return this.threads.reduce((n, t) => n + t.unread, 0);
  }

  toJSON(): Thread[] {
    return this.threads.map((t) => ({ contact: t.contact, messages: t.messages.slice(-30), unread: t.unread }));
  }
}
