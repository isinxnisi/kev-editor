// 画面の「サンプル」から読み込む入力例。
// criteria の書き方は kev.js の先頭コメントを参照。

export const SAMPLES = [
  {
    name: "経費申請チェック",
    state: `申請者: 営業部 佐藤
申請日: 2026-10-05
内容: 取引先 A社との打ち合わせ後の会食（2026-09-12）
金額: 48,000円（参加 4名：当社 2名、A社 2名）
支払先: 割烹料理店
備考: 領収書あり`,
    questions: [
      {
        id: "category", type: "choice", text: "適切な勘定科目はどれか？",
        choice: [
          { name: "交通費", desc: "電車・タクシーなどの移動費用" },
          { name: "会議費", desc: "社内外の打ち合わせでの軽食・飲み物" },
          { name: "交際費", desc: "取引先との会食・接待・贈答" },
          { name: "消耗品費", desc: "文房具や小物の購入" },
        ],
      },
      {
        id: "needs_approval", type: "noul", text: "上長の追加承認が必要か？",
        noul: { true: "1人あたり 5,000円を超える飲食が含まれる", false: "1人あたり 5,000円以下" },
      },
      {
        id: "completeness", type: "score", text: "申請内容の記載は十分か？",
        score: ["不足が多い", "一部不足している", "十分に記載されている"],
      },
    ],
  },
  {
    name: "ヘルプデスクの振り分け",
    state: "朝から VPN につながらず、社内システムにログインできません。昨日までは問題なく使えていました。本日 15 時の顧客向けデモで使う予定なので困っています。",
    questions: [
      {
        id: "team", type: "choice", text: "どの担当に振り分けるか？",
        choice: [
          { name: "アカウント", desc: "パスワード・権限・ログイン ID" },
          { name: "ネットワーク", desc: "VPN・Wi-Fi・社内 LAN" },
          { name: "ハードウェア", desc: "PC 本体・周辺機器の故障" },
          { name: "業務アプリ", desc: "社内システムの不具合・操作方法" },
        ],
      },
      { id: "urgent", type: "noul", text: "本日中の対応が必要か？" },
      {
        id: "impact", type: "score", text: "業務への影響度",
        score: ["影響なし", "一部の作業に支障", "業務が止まる"],
      },
    ],
  },
  {
    name: "商品レビューの分析",
    state: "デザインは気に入っています。ただ、2 週間使ったらバッテリーの持ちが明らかに悪くなりました。サポートに問い合わせたら丁寧に対応してもらえたので、交換品に期待します。",
    questions: [
      {
        id: "rating", type: "score", text: "このレビューの評価は星いくつ相当か？",
        score: ["★1 とても不満", "★2 不満", "★3 普通", "★4 満足", "★5 とても満足"],
      },
      {
        id: "sentiment", type: "choice", text: "全体の印象",
        choice: [
          { name: "ポジティブ", desc: null },
          { name: "ネガティブ", desc: null },
          { name: "混在", desc: "良い点と悪い点の両方がある" },
        ],
      },
      { id: "wants_exchange", type: "noul", text: "返品・交換を求めているか？" },
    ],
  },
  {
    name: "Support ticket (English)",
    state: "Hi, I ordered a blender (order #4821) two weeks ago and it still hasn't arrived. Tracking hasn't updated in 6 days. This is the second time this has happened. I want a refund if it doesn't arrive by Friday.",
    questions: [
      {
        id: "department", type: "choice", text: "Which team should handle this?",
        choice: [
          { name: "returns", desc: "Refunds and returns of delivered items" },
          { name: "shipping", desc: "Delivery delays and tracking" },
          { name: "billing", desc: "Charges, invoices and payment methods" },
        ],
      },
      { id: "escalate", type: "noul", text: "Should this be escalated to a human agent?" },
      {
        id: "frustration", type: "score", text: "How frustrated is the customer?",
        score: ["Calm", "Frustrated", "Very angry"],
      },
    ],
  },
];
