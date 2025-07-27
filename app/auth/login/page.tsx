'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

export default function HomePage() {
  const { login, logout, ready, authenticated } = usePrivy()

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-white relative">
      
      {/* Кнопка Назад */}
      <Link href="/" className="absolute top-4 left-4 text-indigo-600 hover:underline font-medium">
        ← Назад
      </Link>

      {/* Кнопка Login / Logout */}
      {!authenticated ? (
        <button
          onClick={() => login()}
          disabled={!ready}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700"
        >
          Login
        </button>
      ) : (
        <button
          onClick={() => logout()}
          disabled={!ready}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700"
        >
          Logout
        </button>
      )}
    </div>
  )
}
