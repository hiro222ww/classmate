# Classmate 音声通話安定化に関する技術レポート

**対象システム:** Classmate（Web 版少人数音声ルーム）  
**想定規模:** 最大 5 人程度  
**アーキテクチャ:** Next.js / TypeScript / Supabase / WebRTC mesh + 自前 TURN（coturn）  
**文書種別:** 技術レポート原稿（学術論文提出用ではない）  
**安定版参照:** タグ `good-voice-4devices-peer-health-stable`（commit `cff4fcb`）

---

## 1. 要旨

本レポートは、教育向け Web アプリケーション Classmate において、SFU（Selective Forwarding Unit）を導入せず、少人数 mesh 構成と自前 TURN サーバーにより音声通話を安定化した取り組みを整理したものである。完全 P2P 運用期には同一回線では接続できても別回線では不安定となるなど、NAT・回線相性への依存が顕著であった。自前 TURN 導入後は通信経路の予測可能性は改善した一方、ボトルネックは「回線の当たり外れ」から「複数 peer の状態管理・再接続制御・UI 表示の整合」へ移行した。

本開発では、(1) 再入室時の状態リセット、(2) active/passive 役割の明確化、(3) 通話中メンバー増減の live sync、(4) remote 単位の peer health repair ラダー、(5) `audio_confirmed_strict` に基づく成立済み peer の frozen 保護、(6) ユーザー向けステータス表示の優先順位整理、(7) 黒板 Realtime のソフト再接続表示、を段階的に実装した。実機検証では 3〜4 台構成で `connected_soft` から `audio_confirmed_strict`、UI 上の「通話中」まで自然に到達するケースが増え、不要な `reconnect-request` や過剰な `suppress_unstable` ログも減少した。

結論として、初期仕様の範囲では SFU なしでも最大 5 人程度の音声通話は実用域に近づき得る。ただし人数・端末多様性・長時間通話・発熱・帯域監視を考慮すると、将来的な SFU 移行条件の整理は引き続き必要である。

---

## 2. 背景

### 2.1 少人数音声とコスト制約

Classmate は教室・少人数グループ向けの Web アプリケーションであり、音声通話は補助的かつ中核的な機能である。初期段階では、サーバー中継コストを抑えつつ迅速に提供するため、クライアント間の full mesh（各端末が他全員と `RTCPeerConnection` を張る構成）を採用した。人数 \(n\) に対し接続数は \(n(n-1)/2\) であり、3 人で 3 ペア、4 人で 6 ペア、5 人で 10 ペアとなる。少人数であっても、各 peer ごとにシグナリング状態・ICE 状態・再生確認・UI 表示・修復タイマーが独立に存在するため、状態空間は単純な 2 台通話より桁違いに複雑になる。

### 2.2 完全 P2P 時代の限界

完全 P2P（STUN のみ、または TURN 未整備）では、同一 LAN・同一回線では比較的安定する一方、別回線・モバイル回線・企業 NAT 環境では接続成功率と維持率にばらつきが大きかった。問題の主因はアプリケーション層のロジックというより、到達可能性（reachability）とメディア経路の不安定さにあった。

### 2.3 自前 TURN 導入後の課題シフト

自前 TURN（coturn）を static 設定で組み込んだことで、通信経路の制御可能性とコスト予測性は改善した。しかし運用上の主要課題は次のように移った。

- 再入室・リロード後に古い `connectionId` や remote stream が残る
- 特定ペアのみ無音、または一方通行になる
- passive 側が不要な offer を送出し、シグナリングが競合する
- 4 人目参加が既存端末に反映されない
- 退出・スリープ端末が「通話中」「接続が不安定です」として残る
- 音声は成立しているのに UI が「再接続中…」を示す
- 自動復旧が成立済み peer に `reconnect-request` を送り、逆に音声を揺らす
- 黒板の Supabase Realtime 切断が強いエラー表示になる

すなわち、TURN 導入後は「経路を確保する」ことに加え、「いつ・誰を・どの程度修復するか」「ユーザーに何を見せるか」の設計が品質を左右する段階に入った。

---

## 3. システム構成

### 3.1 アプリケーション層

- **フロントエンド:** Next.js（App Router）、TypeScript
- **シグナリング:** Supabase（DB 経由の offer / answer / ICE / `reconnect-request` 等）
- **メンバー・プレゼンス:** API poll と session members の merge
- **音声 UI:** remote 単位の診断情報とユーザー向けステータスラベル（内部診断と表示を分離）

### 3.2 WebRTC 層

- **トポロジ:** full mesh（各参加者が他参加者と 1:1 の peer connection）
- **役割:** active / passive（device id 等に基づく offer 所有者の明確化）
- **接続識別:** `connectionId` によるシグナリング世代管理
- **再入室検知:** voice epoch / `joined_at` 等によるセッション内世代の区別
- **再生確認:** `connected_soft`（再生開始のソフト証拠）→ `audio_confirmed_strict`（厳密な再生確認）

### 3.3 中継層

- **TURN:** 自前 coturn（static 資格情報）
- **方針:** 直接接続を優先しつつ、到達性に問題がある環境では TURN 経由を許容
- **効果:** 完全 P2P 時代と比較し、回線相性による失敗率を低減（ただし mesh 自体の複雑さは残る）

### 3.4 補助機能（黒板）

- **リアルタイム:** Supabase Realtime（broadcast + postgres changes）
- **補完:** API poll によるストローク取得
- **方針:** WebSocket 一時切断をエラーではなく「再接続中…」として扱い、描画内容は poll で維持

---

## 4. 問題設定

本プロジェクトで扱った問題は、単一のバグではなく、複数レイヤが相互作用する系統的な不安定さとして現れた。整理すると次の 4 類型に分けられる。

### 4.1 状態の残留（stale state）

再入室・リロード・シグナリング再開時に、旧 `connectionId`、remote stream、playback evidence、各種タイマー、修復フラグが残ると、新しい接続試行と旧状態が競合する。2 台では顕在化しにくいが、3 台以上で「特定ペアだけおかしい」という形で表面化しやすい。

### 4.2 シグナリング役割の逸脱（role leakage）

mesh では各ペアで offer/answer の主導権が必要である。passive 側が rejoin 後に offer を出す、または `auto_hard_reset` 経路で passive offer が許可されるなど、役割制御の抜け道があると、glare や不要な renegotiation が発生する。

### 4.3 メンバー集合と peer 集合の不整合

通話 UI 上の参加者集合と、実際に維持している `RTCPeerConnection` 集合がずれると、4 人目が参加しても既存端末に反映されない、あるいは退出済み remote の診断が残るといった問題が起きる。特に Call 画面滞在中の live sync が弱いと、peer 追加・削除が遅延または欠落する。

### 4.4 自動復旧の false positive

音声は聞こえている（inbound パケット増加、`audio_confirmed_strict` 到達）にもかかわらず、health 評価が `audio_confirmed_strict_pending` と判定し `reconnect-request` を送ると、成立済みペアに不要な reset が入り、音声が一時的に揺れる。自動復旧は「弱いと繋がらない」ではなく、「強すぎると繋がっているものを壊す」という逆問題を生む。

### 4.5 UI と内部診断の乖離

内部では `音声確認中`、repair 中、`health_audio_confirmed_strict_pending` などの中間状態が存在するが、ユーザーには単純な文言（接続中… / 通話中 / 再接続中…）で伝える必要がある。内部状態をそのまま表示すると、成立後も「再接続中…」「接続が不安定です」が出るなど、体験上の信頼性を損なう。

---

## 5. 実装した安定化手法

以下ではコード変更の網羅ではなく、設計判断と問題解決の流れを中心に述べる。

### 5.1 再入室・世代管理と remote 単位の掃除

**voice epoch / joined_at** により、同一セッション内でも「新しい参加サイクル」を識別する。再入室時には remote ごとに peer 状態をリセットし、古い `connectionId`、remote stream、playback evidence、関連タイマーを掃除する。ここでの意図は、全員一斉 reset を避けつつ、再参加した（または再交渉が必要な）remote だけをクリーンな初期状態に戻すことである。

### 5.2 active / passive 役割の明確化

各 peer ペアで offer 所有者（active）を一意に定め、passive は answer 待ちを基本とする。特に rejoin 後の **passive offer 禁止**、および `auto_hard_reset_passive_offer` 経路の抜け道修正により、不要な offer 送出を抑制した。シグナリングの交通整理はユーザーに見えないが、無音・一方通行の主要因の一つであるため、プロトコル層での規律が重要である。

### 5.3 通話中メンバー増減の live sync

Call 中も **4 秒間隔**で session members を poll し、集合変化を検知する。方針は次のとおりである。

| イベント | 動作 |
|----------|------|
| 新規 remote 参加 | 新規 remote のみ peer 追加 |
| remote 退出 | **12 秒 grace** 後に cleanup |
| 既存成立 peer | 巻き添え reset しない |

これにより、4 人目参加が既存端末に反映されない問題や、退出端末の長期残留を、全 peer 再生成なしで緩和する。

### 5.4 remote 単位の peer health repair ラダー

`voicePeerHealth` により、各 remote を独立に観測し、修復を段階化した。

```
observe
  → reconnect_request
  → soft_reset
  → hard_reset
  → give_up
```

**設計原則:**

- 不調な remote だけを差分修復する（全員 reset しない）
- join 直後・短時間の揺れは observe に留める
- 修復クールダウンにより retry 連打を抑える

**成立済み peer の保護（frozen）:**

- `audio_confirmed_strict` 到達後は `repairStage` を observe に戻し、retry 系カウンタをクリア
- `lastAudioConfirmedAt` により、短時間の `packets=0` や level の揺れで pending に戻さない
- playback evidence がある peer は `audio_confirmed_strict_pending` 修復対象から除外
- 受信した `reconnect-request` について、自側が strict 済みかつ `connectionId` 一致・transport 正常なら **suppress**（peer を閉じない）

この一連により、「聞こえているのに repair が飛ぶ」false positive を抑え、TURN 導入後の主要リスクであった過剰自動復旧を抑制した。

### 5.5 ステータス表示の優先順位

ユーザー向け表示と内部診断を分離し、次の優先順位でラベルを決定する。

| 優先度 | 条件（要約） | 表示 |
|--------|----------------|------|
| 1 | 明示的退出・不在 grace 満了 | 退出 / 非表示 |
| 2 | `audio_confirmed_strict` / playback confirmed | **通話中** |
| 3 | `connected_soft` / remote track playing | **通話中**（再接続中にしない） |
| 4 | repair 中かつ未 confirmed | 再接続中… |
| 5 | 未 confirmed が長時間継続 | 接続が不安定です |
| 6 | give_up | 入り直してください |

`voicePeerRepairInProgress` や `health_audio_confirmed_strict_pending` より **strict / playback evidence を優先**する。hysteresis により、内部文言（音声確認中 等）が `previous` に残ってもユーザー表示を上書きしない。`suppress_unstable` 系ログは debug 時のみとし、本番ログは `audio_confirmed_strict` 初回・give_up・明確な error に絞る。

### 5.6 黒板 Realtime のソフト再接続

Supabase Realtime の一時切断（Safari・電波変動等）に対し、

- 強いエラーではなく **「再接続中…」**
- **4 秒**ごとの自動再購読
- **5 秒** poll による API 補完
- `sessionId` 変更時の旧チャンネル購読停止・イベント無視

を実装した。音声通話と同様、ユーザーには交通整理を見せず、内容の継続性を優先する。

---

## 6. 評価ログと観察結果

本節は厳密なベンチマークではなく、開発・実機検証における観察の整理である。

### 6.1 接続成立ログ

複数端末（3〜4 台）構成で、remote ごとに次の遷移が確認された。

1. シグナリング・ICE 接続
2. remote track 受信・`connected_soft` 相当の再生開始
3. `[remote-audio] audio_confirmed_strict` の到達
4. UI ステータス「通話中」への遷移（`from=connected_soft to=connected reason=audio_confirmed_strict` 等）

iOS conservative mode 下でも、複数 remote が同時に「通話中」となるケースが増えた。

### 6.2 過剰修復の減少

改善前は、strict 済み・inbound パケット増加中にも `health_audio_confirmed_strict_pending` 由来の `reconnect-request-received` が観測され、成立済みペアに不要な renegotiation が入ることがあった。frozen 保護・inbound suppress・表示優先順位修正後は、当該パターンの頻度が目視で減少した。

### 6.3 メンバー sync

4 人目参加がリロードなしで既存端末に反映されるようになった。退出端末は grace 後に cleanup され、「幽霊メンバー」として通話 UI に残る時間が短縮された。

### 6.4 ログノイズ

`suppress_unstable` の大量出力が抑えられ、debug 有効時のみ詳細が出る構成となった。本番観測では `audio_confirmed_strict` と明確な失敗系にログが集約され、実機調査の効率が上がった。

### 6.5 TURN 導入の効果（定性）

完全 P2P 時代に比べ、別回線間での「まったく繋がらない」事象は減った。一方で mesh 特有の状態管理コストは残り、TURN は経路問題の緩和であり、peer 数増加に伴うアプリケーション複雑性の代替ではない。

---

## 7. 考察

### 7.1 なぜ「全員 reset」ではなく「差分修復」か

少人数 mesh では、1 ペアの不調が全体修復によって他の成立済みペアを巻き込むコストが大きい。成立済み接続は「資産」として扱い、観測で本当に dead と判断できた remote のみをラダーで修復する方が、全体の可用性を最大化しやすい。

### 7.2 自動復旧の設計トレードオフ

自動復旧は欠陥に対する保険であるが、誤検知（false positive）のコストは成立済み音声の中断という形で即座にユーザー体験に現れる。したがって repair 条件は保守的に設計し、**strict 到達を frozen 条件**とするのが有効であった。これは「繋がりそうな peer は待つ」「本当に死んだ peer だけ直す」という方針の具体化である。

### 7.3 UI 単純化と内部診断の分離

WebRTC の内部状態は豊かだが、ユーザーが必要とする情報量は少ない。内部の `音声確認中`・repair stage・pending reason をそのまま出すと、実際より不安を与える。表示用ステータスを少数のラベルに正規化し、診断はログ・debug 用に残す構成は、教育現場での継続利用において重要である。

### 7.4 SFU なしの位置づけ

本取り組みは、**初期仕様の範囲では SFU なしでも少人数音声は成立可能性がある**ことを示唆する。ただし mesh は \(O(n^2)\) の接続と帯域・CPU 負荷を伴い、5 人・モバイル・長時間通話では TURN 帯域と端末発熱がボトルネックになり得る。SFU 移行は「常に不要」とは言えず、次節の条件で判断するのが妥当である。

---

## 8. 今後の課題

| 領域 | 課題 |
|------|------|
| Peer health | スリープ・不在端末への repair 抑制のさらなる精緻化 |
| Retry 制御 | retry-exhausted 連打の抑制、クールダウン設計の見直し |
| 実機検証 | 5 人構成の系統的テスト、端末組み合わせマトリクス |
| クライアント負荷 | iPhone 発熱・ログ負荷の削減（特に poll / stats 間隔） |
| インフラ | 自前 TURN の帯域・同時セッション監視、アラート |
| デプロイ | 本番 URL / 開発 URL 分離（Vercel project 分離） |
| アーキテクチャ | SFU 移行条件（人数上限、同時ルーム数、TURN 帯域閾値）の整理 |

### SFU 移行を検討しうる条件（案）

- 恒常的に 5 人通話が前提になる
- TURN 出口帯域が持続的に閾値を超える
- モバイル端末での発熱・バッテリー低下が許容を超える
- mesh 固有のシグナリング競合が人数増加で再発する

---

## 9. まとめ

Classmate の音声通話安定化は、単一の WebRTC パラメータ調整ではなく、**経路（TURN）・シグナリング規律（active/passive・connectionId・epoch）・メンバー同期・差分修復・UI 正規化**を組み合わせた系統的な取り組みであった。自前 TURN は回線相性問題を緩和したが、真の難所は複数 peer のライフサイクル管理へ移った。`audio_confirmed_strict` を境界条件とした frozen 保護と、ユーザー向けステータス優先順位の整理は、技術的成立と体験上の信頼性の両方に寄与した。

現時点の評価は、最大 5 人程度の音声通話が **実用域に近づいた** という慎重な表現が妥当である。今後は 5 人実機・帯域監視・負荷削減を進めつつ、必要に応じて SFU 移行判断の基準を明文化することが望まれる。

---

## 参考: 主要実装概念一覧

| 概念 | 役割（要約） |
|------|----------------|
| `connectionId` | シグナリング世代の一致確認 |
| voice epoch / joined_at | 再入室・参加サイクルの識別 |
| active / passive | offer 所有者の一意化 |
| `connected_soft` | 再生開始のソフト証拠 |
| `audio_confirmed_strict` | 厳密な再生確認・frozen 境界 |
| `voicePeerHealth` | remote 単位の健康分類と repair ラダー |
| `reconnect-request` | 段階修復における明示的再同期シグナル |
| live sync | Call 中のメンバー poll と差分 peer 更新 |
| TURN (coturn) | 到達性確保と経路の予測可能性 |

---

## 付録: 技術ブログ化する場合のタイトル案

1. **「繋がったのに直すな」— 少人数 WebRTC mesh で学んだ、成立済み peer の保護**
2. **SFU なしで 5 人音声はどこまでいけるか：Classmate の TURN + 差分修復の記録**
3. **音声は聞こえるのに UI は再接続中 — WebRTC アプリのステータス設計**
4. **3 台で動く、4 台で壊れる：mesh 通話の状態管理が難しい理由**
5. **自前 TURN を入れたら次に来た問題：peer health と false positive 自動復旧**

---

*本ドキュメントは開発記録・技術説明・ブログ原稿のベースとして随時更新してよい。*
