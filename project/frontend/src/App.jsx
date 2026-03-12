import { useState, useEffect } from 'react'
import MainInteractionScreen from './screens/MainInteractionScreen'
import SettingsScreen from './screens/SettingsScreen'
import AppUsageScreen from './screens/AppUsageScreen'

export default function App() {
  const [view, setView] = useState('main')
  const [avatarId, setAvatarId] = useState('671f8f176e34f8f3f9dc7f4b')
  const [voiceLang, setVoiceLang] = useState('en-US')
  const [theme, setTheme] = useState(() => localStorage.getItem('unison_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('unison_theme', theme)
  }, [theme])

  return (
    <div className="container app-shell">
      <header className="app-header">
        <button
          className={`icon-button ${view === 'main' ? 'active' : ''}`}
          onClick={() => setView('main')}
          title="Home"
          aria-label="Go to main screen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </button>
        <h1>UNISON</h1>
        <div className="header-right-actions">
          <button
            className="icon-button theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
          className={`icon-button ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
          title="Settings"
          aria-label="Open settings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.14 12.94a7.6 7.6 0 0 0 .05-.94 7.6 7.6 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.37 7.37 0 0 0-1.63-.95l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.58.22-1.12.54-1.63.95l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0-.05.94c0 .32.02.63.05.94L2.82 14.5a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.73 1.63.95l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54c.58-.22 1.12-.54 1.63-.95l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.56ZM12 15.25A3.25 3.25 0 1 1 12 8.75a3.25 3.25 0 0 1 0 6.5Z" />
          </svg>
        </button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="usage-sidebar">
          <AppUsageScreen />
        </aside>

        <main className="content-stage">
          {view === 'main' && (
            <MainInteractionScreen avatarId={avatarId} voiceLang={voiceLang} />
          )}
          {view === 'settings' && <SettingsScreen avatarId={avatarId} setAvatarId={setAvatarId} voiceLang={voiceLang} setVoiceLang={setVoiceLang} />}
        </main>
      </div>
    </div>
  )
}
