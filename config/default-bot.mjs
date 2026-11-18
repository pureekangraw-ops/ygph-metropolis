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
      id: 'CLOSING_READY',
      match: /สั่งซื้อ|เอาอันนี้|ตกลงเอา|จองคิว|เริ่มงาน|เลขบัญชี|พร้อมโอน|ออกบิล|ใบเสนอราคา|รับแพ็กเกจ|สมัครเลย/i,
      action: 'HANDOFF',
      reason: 'CLOSING_READY',
      reply: 'ยินดีเลยครับ เดี๋ยวสรุปรายละเอียดส่งต่อให้แอดมินเช็กคิวงาน ออกเอกสาร และแจ้งช่องทางชำระเงินที่ถูกต้องให้นะครับ',
      allowModel: false,
    },
    {
      id: 'URGENT_TIMELINE',
      match: /ด่วน|วันนี้|พรุ่งนี้|รีบใช้|ทันไหม|urgent|asap/i,
      action: 'HANDOFF',
      reason: 'URGENT_REQUEST',
      reply: 'รับทราบว่าเป็นงานด่วนครับ เดี๋ยวสรุปรายละเอียดส่งต่อให้ทีมเช็กคิวแทรกงานให้ทันทีนะครับ',
      allowModel: false,
    },
    {
      id: 'DISCOUNT_NEGOTIATION',
      match: /ลดได้ไหม|ขอส่วนลด|ลดราคา|ต่อราคา|พิเศษได้ไหม|แถมไหม|ผ่อนได้ไหม/i,
      action: 'HANDOFF',
      reason: 'DISCOUNT_REQUEST',
      reply: 'ราคาแพ็กเกจจะเป็นตามรายการมาตรฐานครับ แต่ถ้ามีหลายช่องทางหรือขอบเขตเฉพาะ เดี๋ยวส่งต่อทีมช่วยดูข้อเสนอที่เหมาะสมให้ครับ',
      allowModel: false,
    },
    {
      id: 'COMPETITOR_COMPARE',
      match: /เจ้าอื่น|ที่อื่น|ต่างจาก|ดีกว่ายังไง|ทำไมต้อง|สู้.*ได้ไหม/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'COMPETITOR_COMPARE',
      reply: 'จุดเด่นของเราคือปรับแต่งเงื่อนไขการตอบ คุมเพดานราคาไม่ให้บอทมั่ว และเชื่อมข้อมูลสินค้าของร้านได้จริงครับ อยากเน้นใช้งานด้านไหนเป็นพิเศษไหมครับ?',
      allowModel: true,
    },
    {
      id: 'INTEGRATION_TECH',
      match: /เชื่อม.*ได้ไหม|\bapi\b|webhook|line\s*oa|facebook|shopee|lazada|google\s*sheet|notion|หลังบ้าน/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'INTEGRATION_TECH',
      reply: 'รองรับการเชื่อมต่อผ่าน Webhook และ API ครับ โดยแพ็กเกจ Starter (4,900 บาท) จะเน้น 1 ช่องทางหลัก ส่วนแพ็กเกจ Pro (12,900 บาท) จะรองรับหลายช่องทางและเชื่อมฐานข้อมูลครับ',
      allowModel: true,
    },
    {
      id: 'OBJECTION_HESITATION',
      match: /แพง|งบไม่ถึง|งบน้อย|ขอคิดดูก่อน|ยังไม่แน่ใจ|ปรึกษา.*ก่อน|ไว้ก่อน|เกินงบ/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'OBJECTION_HESITATION',
      reply: 'เข้าใจเลยครับ ค่อยๆ พิจารณาได้เลย ถ้าอยากเริ่มแบบประหยัดก่อนจะมีแพ็กเกจ Starter 4,900 บาท หรือแจ้งงบกับโจทย์คร่าวๆ ไว้ให้ช่วยแนะนำก่อนได้ครับ',
      allowModel: true,
    },
    {
      id: 'PORTFOLIO_DEMO',
      match: /ตัวอย่าง|ผลงาน|รีวิว|เดโม่|demo|ขอลอง|ทดลองใช้|เคสจริง|ขอดูงาน/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'PORTFOLIO_DEMO',
      reply: 'สามารถทดลองคุยและดูแนวทางการตอบของบอทได้จากแชทนี้เลยครับ อยากลองจำลองโจทย์ธุรกิจแบบไหนพิมพ์ทดสอบมาได้เลยนะ',
      allowModel: true,
    },
    {
      id: 'SUPPORT_WARRANTY',
      match: /ประกัน|ดูแลหลังขาย|พัง|ใช้งานไม่ได้|บั๊ก|\bbug\b|แก้ไขได้ไหม|สอนใช้ไหม/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'SUPPORT_WARRANTY',
      reply: 'เรามีดูแลหลังติดตั้งและสอนวิธีปรับแก้เงื่อนไขการตอบให้ตามขอบเขตครับ ถ้าพบปัญหาการใช้งานแจ้งรายละเอียดส่งต่อทีมตรวจให้ได้เลยนะครับ',
      allowModel: true,
    },
    {
      id: 'INTEREST_DISCOVERY',
      match: /สนใจ|สอบถาม|ขอดู|มีอะไรบ้าง|ทำอะไรได้บ้าง|แนะนำหน่อย|เริ่มยังไง/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'INTEREST_DISCOVERY',
      reply: 'ยินดีแนะนำครับ ตอนนี้มีแพ็กเกจ Starter (4,900 บาท) และ Pro แชทบอทกลาง (12,900 บาท) — งานนี้อยากนำไปใช้ช่วยขายหรือตอบลูกค้าด้านไหนเป็นหลักครับ?',
      allowModel: true,
    },
    {
      id: 'GREETING_MENU',
      match: /^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|ทักครับ|ทักค่ะ|hi|hello|menu|เมนู|เริ่มต้น)[!.\sครับค่ะจ้า]*$/i,
      action: 'OBSERVE',
      status: 'OBSERVED',
      reply: 'สวัสดีครับ! สอบถามแพ็กเกจ ราคา ทดลองเดโม่ หรือแจ้งรายละเอียดงานที่อยากทำได้เลยครับ',
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
