import { useEffect, useState } from 'preact/hooks';
import { WEEKDAY_KEYS } from '../core/time';
import { lessonRoom } from '../core/schedule';
import { formatRoom } from '../core/format';
import { getSubject, mainSchedule } from '../data/schedule';
import { isStoragePersisted, usePwaState } from '../pwa';
import { clockOverride } from '../hooks';

const DAY_TITLES: Record<string, string> = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг',
  fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье',
};

export function MoreScreen() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const pwa = usePwaState();

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  return (
    <section class="screen" aria-labelledby="more-title">
      <h1 id="more-title">Ещё</h1>

      <details class="panel" open>
        <summary>Основное расписание</summary>
        <p class="muted small">
          Хранится в файле <code>data/schedule.json</code>. Когда поменяется семестр — попроси Claude обновить его.
          Временное расписание и замены появятся на этапе 2.
        </p>
        {WEEKDAY_KEYS.filter((k) => mainSchedule.week[k]?.length).map((key) => (
          <div class="main-day" key={key}>
            <h2>{DAY_TITLES[key]}</h2>
            <table class="table">
              <tbody>
                {mainSchedule.week[key]!.map((l, i) => {
                  const s = getSubject(l.subjectId);
                  return (
                    <tr key={i}>
                      <td class="nowrap">
                        {l.start}–{l.end}
                      </td>
                      <td>
                        <strong>{s.short}</strong>
                        {s.short !== s.full && <div class="muted small">{s.full}</div>}
                        {l.note && <div class="muted small">{l.note}</div>}
                      </td>
                      <td class="nowrap">{formatRoom(lessonRoom(l, 1)) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </details>

      <details class="panel">
        <summary>Предметы и сокращения</summary>
        <table class="table">
          <tbody>
            {mainSchedule.subjects.map((s) => (
              <tr key={s.id}>
                <td class="nowrap">
                  <strong>{s.short}</strong>
                </td>
                <td>{s.full}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details class="panel">
        <summary>О приложении</summary>
        <ul class="facts">
          <li>Версия {__APP_VERSION__}, сборка {new Date(__BUILD_TIME__).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</li>
          <li>Время — московское (Europe/Moscow), независимо от настроек устройства.</li>
          <li>
            Работа без интернета:{' '}
            {'serviceWorker' in navigator ? (pwa.offlineReady ? 'готово' : 'включена') : 'не поддерживается этим браузером'}
          </li>
          <li>
            Данные защищены от автоочистки:{' '}
            {persisted === null ? 'неизвестно' : persisted ? 'да' : 'нет (станет «да» после установки на главный экран)'}
          </li>
          {clockOverride && <li>Включено тестовое время из адреса страницы (?now=…).</li>}
        </ul>
      </details>
    </section>
  );
}
