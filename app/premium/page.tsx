'use client'

import { useEffect, useState } from 'react'

type Entitlements = {
  plan: string
}

export default function PremiumPage() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const isPlus = entitlements?.plan === 'plus'

  useEffect(() => {
    fetch('/api/user/entitlements')
      .then(res => res.json())
      .then(setEntitlements)
  }, [])

  return (
    <div className="max-w-md mx-auto px-5 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">classmate Premium</h1>
        <p className="text-gray-600 leading-relaxed">
          話す相手を増やすより、<br />
          <span className="font-semibold">「居たい場所」</span>を選べるように。
        </p>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-500 leading-relaxed">
        classmateは、少人数で落ち着いて話すための
        クラス制コミュニティです。<br />
        Premiumでは、世界観やテーマを選び、
        自分に合ったクラスに参加できます。
      </p>

      {/* Plans */}
      <div className="grid grid-cols-2 gap-4">
        <PlanCard
          title="Free"
          items={[
            '年齢フィルタ',
            '通話・チャット',
            'おすすめクラス',
          ]}
        />

        <PlanCard
          title="Premium"
          premium
          items={[
            '世界観クラス',
            '属性テーマ',
            'クラス作成',
            '複数クラス所属',
          ]}
        />
      </div>

      {/* Action */}
      {!isPlus ? (
        <button
          className="w-full py-3 rounded-lg bg-black text-white font-semibold"
          onClick={async () => {
            await fetch('/api/debug/enable-premium', { method: 'POST' })
            location.reload()
          }}
        >
          Premiumを有効化（テスト）
        </button>
      ) : (
        <div className="w-full py-3 rounded-lg bg-green-50 text-green-700 text-center font-semibold">
          Premium有効中
        </div>
      )}
    </div>
  )
}

function PlanCard({
  title,
  items,
  premium,
}: {
  title: string
  items: string[]
  premium?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        premium
          ? 'border-black bg-gray-50'
          : 'border-gray-200'
      }`}
    >
      <div className="font-semibold">
        {title} {premium && '✨'}
      </div>
      <ul className="text-sm text-gray-600 space-y-1">
        {items.map(item => (
          <li key={item}>✔ {item}</li>
        ))}
      </ul>
    </div>
  )
}
