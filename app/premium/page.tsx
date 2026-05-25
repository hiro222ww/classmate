export default function PremiumPage() {
  const [deviceId, setDeviceId] = useState("");
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busyKey, setBusyKey] = useState("");

  const [billingNoticeEnabled, setBillingNoticeEnabled] =
    useState(true);

  const [billingNoticeText, setBillingNoticeText] =
    useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  // 🔥 entitlement取得
  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      try {
        const r = await fetch("/api/user/entitlements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });

        const j = await r.json().catch(() => null);

        if (r.ok && j) {
          setEnt({
            class_slots: Number(j?.class_slots ?? 1),
            topic_plan: Number(j?.topic_plan ?? 0),
          });
        }
      } catch {
        // silent
      }
    })();
  }, [deviceId]);

  // 🔥 管理設定取得
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          "/api/admin/settings",
          {
            cache: "no-store",
          }
        );

        const j = await r
          .json()
          .catch(() => null);

        const s = j?.settings;

        if (!s) return;

        setBillingNoticeEnabled(
          Boolean(
            s.billing_notice?.enabled
          )
        );

        setBillingNoticeText(
          String(
            s.billing_notice?.text ??
              ""
          )
        );
      } catch {
        // silent
      }
    })();
  }, []);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopic = Number(ent?.topic_plan ?? 0);

  const canClick = useMemo(
    () => !!deviceId && !busyKey,
    [deviceId, busyKey]
  );

  async function start(body: any) {
    try {
      setBusyKey(JSON.stringify(body));

      const dev =
        typeof window !== "undefined"
          ? new URLSearchParams(
              window.location.search
            ).get("dev") ?? ""
          : "";

      const r = await fetch(
        "/api/billing/create-checkout-session",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            deviceId,
            ...body,
            dev,
          }),
        }
      );

      const j = await r
        .json()
        .catch(() => null);

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      alert(
        "決済ページの作成に失敗しました"
      );
    } catch {
      alert(
        "通信エラーが発生しました"
      );
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent:
            "space-between",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
          }}
        >
          プラン
        </h1>

        <Link href={withDev("/billing")}>
          支払い管理
        </Link>
      </header>

      {/* 現在の状態 */}
      <SoftCard>
        <div
          style={{
            fontSize: 14,
            color: "#666",
          }}
        >
          現在の状態
        </div>

        <div
          style={{
            marginTop: 8,
            fontWeight: 900,
          }}
        >
          テーマ：
          {currentTopic || "無料"}
        </div>

        <div
          style={{
            marginTop: 4,
            fontWeight: 900,
          }}
        >
          クラス枠：
          {currentSlots}
        </div>
      </SoftCard>

      {/* 🔥 注意文 */}
      {billingNoticeEnabled &&
      billingNoticeText ? (
        <SoftCard>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.8,
              color: "#666",
              whiteSpace:
                "pre-wrap",
            }}
          >
            {billingNoticeText}
          </div>
        </SoftCard>
      ) : null}

      {/* テーマ */}
      <SoftCard>
        <div
          style={{
            fontWeight: 900,
          }}
        >
          テーマ
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 10,
          }}
        >
          {[400, 800, 1200].map(
            (p) => (
              <PlanCard
                key={p}
                title={`¥${p}`}
                price="/月"
                active={
                  currentTopic === p
                }
                disabled={
                  !canClick ||
                  currentTopic >= p
                }
                busy={busyKey.includes(
                  String(p)
                )}
                primary={p === 1200}
                buttonLabel="選ぶ"
                onClick={() =>
                  start({
                    kind:
                      "topic_plan",
                    amount: p,
                  })
                }
              />
            )
          )}
        </div>
      </SoftCard>

      {/* スロット */}
      <SoftCard>
        <div
          style={{
            fontWeight: 900,
          }}
        >
          クラス枠
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 10,
          }}
        >
          {[3, 5].map((s) => (
            <PlanCard
              key={s}
              title={`${s}クラス`}
              price="/月"
              active={
                currentSlots === s
              }
              disabled={
                !canClick ||
                currentSlots >= s
              }
              busy={busyKey.includes(
                String(s)
              )}
              primary={s === 5}
              buttonLabel="増やす"
              onClick={() =>
                start({
                  kind: "slots",
                  slotsTotal: s,
                })
              }
            />
          ))}
        </div>
      </SoftCard>
    </main>
  );
}