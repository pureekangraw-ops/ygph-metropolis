/**
 * Central Bot Configuration.
 * Add new conditions (`rules`), `briefFields`, or knowledge (`catalogue`, `faq`, `policies`) here
 * without touching the core runtime or channel adapters.
 */

export const defaultBotConfig = {
  persona: 'สุภาพ กระชับ เป็นกันเอง ใช้ครับ/ค่ะ เหมาะกับงานขายหน้าร้าน',

  // Fields collected before handing off a qualified lead to the team
  briefFields: [
    { key: 'goal', prompt: 'งานนี้อยากนำไปใช้ทำอะไรครับ?' },
    { key: 'scope', prompt: 'อยากให้ช่วยทำส่วนไหนของงานนี้ครับ?' },
  ],

  // Custom deterministic rules evaluated before general LLM chat
  rules: [
    {
      id: 'GREETING_MENU',
      match: /^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|ทักครับ|ทักค่ะ|hi|hello|menu|เมนู)[!.\s]*$/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reply: 'สวัสดีครับ! สอบถามแพ็กเกจ ราคา หรือแจ้งรายละเอียดงานที่อยากทำได้เลยครับ',
      allowModel: false,
    },
    {
      id: 'URGENT_TIMELINE',
      match: /ด่วน|วันนี้|พรุ่งนี้|urgent/i,
      action: 'HANDOFF',
      reason: 'URGENT_REQUEST',
      reply: 'รับทราบว่าเป็นงานด่วนครับ เดี๋ยวสรุปรายละเอียดส่งต่อให้ทีมเช็กคิวทันทีนะครับ',
      allowModel: false,
    },
  ],

  // Verified knowledge base (the only source of truth for prices & facts)
  knowledge: {
    policies: [
      'แจ้งราคาเฉพาะแพ็กเกจที่มีใน catalogue เท่านั้น ห้ามลดราคาหรือรับปากคิวงานเอง',
      'หากลูกค้าต้องการใบเสนอราคาทางการ ให้สรุป brief แล้วส่งต่อทีม',
    ],
    catalogue: [
      {
        id: 'pkg-starter',
        name: 'Starter Chatbot Setup',
        category: 'Chatbot',
        price: 4900,
        priceText: '4,900 บาท',
        description: 'ติดตั้งแชทบอทขายของพื้นฐาน 1 ช่องทาง พร้อมฐานความรู้เริ่มต้น',
        tags: ['แชทบอท', 'เริ่มต้น', 'starter', 'line'],
      },
      {
        id: 'pkg-pro',
        name: 'Pro Central Chatbot',
        category: 'Chatbot',
        price: 12900,
        priceText: '12,900 บาท',
        description: 'แชทบอทกลางเชื่อมหลายช่องทาง + ระบบเก็บ brief + เชื่อมฐานข้อมูล',
        tags: ['แชทบอทกลาง', 'pro', 'หลายช่องทาง', 'api'],
      },
    ],
    faq: [
      {
        q: 'ใช้เวลาติดตั้งกี่วัน',
        a: 'โดยทั่วไปใช้เวลา 3-5 วันทำการหลังสรุปขอบเขตงานเรียบร้อยครับ',
        tags: ['เวลา', 'กี่วัน', 'ติดตั้ง', 'นานไหม'],
      },
      {
        q: 'เพิ่มข้อมูลสินค้าหรือเงื่อนไขทีหลังได้ไหม',
        a: 'ได้ครับ สามารถอัปเดต catalogue, FAQ และเงื่อนไขการตอบเพิ่มได้ตลอดโดยไม่กระทบระบบหลัก',
        tags: ['เพิ่มข้อมูล', 'แก้ไข', 'เงื่อนไข', 'ความรู้'],
      },
    ],
  },
};
