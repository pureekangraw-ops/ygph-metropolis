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
    {
      id: 'CLOSING_READY',
      match: /สั่งซื้อ|เอาอันนี้|ตกลงเอา|จองคิว|เริ่มงาน|เลขบัญชี|พร้อมโอน|ออกบิล|รับแพ็กเกจ/i,
      action: 'HANDOFF',
      reason: 'CLOSING_READY',
      reply: 'ยินดีเลยครับ เดี๋ยวส่งต่อให้แอดมินเช็กคิวงานและแจ้งช่องทางชำระเงินที่ถูกต้องให้นะครับ',
      allowModel: false,
    },
    {
      id: 'DISCOUNT_NEGOTIATION',
      match: /ลดได้ไหม|ขอส่วนลด|ลดราคา|ต่อราคา/i,
      action: 'HANDOFF',
      reason: 'DISCOUNT_REQUEST',
      reply: 'ราคาแพ็กเกจจะเป็นตามรายการมาตรฐานครับ แต่ถ้ามีหลายช่องทางหรือขอบเขตเฉพาะ เดี๋ยวส่งต่อทีมช่วยดูข้อเสนอที่เหมาะสมให้ครับ',
      allowModel: false,
    },
    {
      id: 'PORTFOLIO_DEMO',
      match: /ตัวอย่าง|ผลงาน|รีวิว|เดโม่|demo|ขอลอง|ทดลองใช้/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'PORTFOLIO_DEMO',
      reply: 'สามารถทดลองคุยและดูแนวทางการตอบของบอทได้จากเดโม่นี้เลยครับ อยากลองทดสอบในโจทย์ธุรกิจแบบไหนแจ้งมาได้เลยนะ',
      allowModel: true,
    },
    {
      id: 'OBJECTION_HESITATION',
      match: /แพง|งบไม่ถึง|ขอคิดดูก่อน|ยังไม่แน่ใจ|ปรึกษา|ไว้ก่อน/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'OBJECTION_HESITATION',
      reply: 'เข้าใจเลยครับ ค่อยๆ พิจารณาได้เลย ถ้าอยากเริ่มแบบประหยัดก่อนจะมีแพ็กเกจ Starter 4,900 บาท หรือทักมาปรึกษาเพิ่มเติมเมื่อพร้อมได้เสมอครับ',
      allowModel: true,
    },
    {
      id: 'SUPPORT_WARRANTY',
      match: /ประกัน|ดูแลหลังขาย|พัง|ใช้งานไม่ได้|บั๊ก|bug/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'SUPPORT_WARRANTY',
      reply: 'เรามีดูแลหลังติดตั้งและปรับแก้เงื่อนไขการตอบให้ตามขอบเขตครับ ถ้าพบปัญหาการใช้งานแจ้งรายละเอียดส่งต่อทีมตรวจให้ได้เลยนะครับ',
      allowModel: true,
    },
    {
      id: 'INTEREST_DISCOVERY',
      match: /สนใจ|สอบถาม|ขอดู|มีอะไรบ้าง|ทำอะไรได้บ้าง|แนะนำหน่อย/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'INTEREST_DISCOVERY',
      reply: 'ยินดีแนะนำครับ ตอนนี้มีแพ็กเกจ Starter (4,900 บาท) และ Pro แชทบอทกลาง (12,900 บาท) — งานนี้อยากนำไปใช้ช่วยขายหรือตอบลูกค้าด้านไหนเป็นหลักครับ?',
      allowModel: true,
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
