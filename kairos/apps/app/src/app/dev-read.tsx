import { Redirect } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { readPicked } from '@/platform/calendar-reader';
import { timings } from '@/platform/photo';

/**
 * Developer check, compiled in only when EXPO_PUBLIC_DEV_READ=1 (never in a store build).
 *
 * Reads every .jpg in the app's Documents/photos folder through the same code a real photo takes, using the dates
 * listed in Documents/photos/manifest.json ([{ "file", "today" }]), and writes Documents/results.json. It exists so
 * the text-recognition path can be measured on a real iPhone with photographs that were put there with devicectl.
 */
export default function DevRead() {
  if (process.env.EXPO_PUBLIC_DEV_READ !== '1') return <Redirect href="/" />;
  return <Runner />;
}

function Runner() {
  const [line, setLine] = useState('starting');

  useEffect(() => {
    (async () => {
      const dir = new Directory(Paths.document, 'photos');
      const manifest: { file: string; today: string; weekStart?: 0 | 1 | 6 }[] = JSON.parse(
        await new File(dir, 'manifest.json').text(),
      );
      const out: unknown[] = [];
      for (const [i, m] of manifest.entries()) {
        setLine(`${i + 1}/${manifest.length} ${m.file}`);
        const t0 = Date.now();
        try {
          const uri = new File(dir, m.file).uri;
          const session = await readPicked(
            { uri, width: 0, height: 0, kind: 'photo' },
            { today: m.today, ...(m.weekStart !== undefined ? { weekStart: m.weekStart } : {}) },
          );
          const r = session.reading;
          out.push({
            file: m.file,
            ms: Date.now() - t0,
            stages: { ...timings },
            via: session.via,
            failure: session.failure ?? null,
            status: r.status,
            reason: r.reason ?? null,
            months: r.months,
            weekStart: r.weekStart ?? null,
            confidence: r.confidence,
            periods: r.periods,
            predicted: r.predicted,
            days: r.days.filter((d) => d.mark !== 'none').map((d) => `${d.date}:${d.mark}`),
            nDays: r.days.length,
          });
        } catch (e) {
          out.push({ file: m.file, ms: Date.now() - t0, error: String(e) });
        }
      }
      const result = new File(Paths.document, 'results.json');
      if (result.exists) result.delete();
      result.create();
      result.write(JSON.stringify(out));
      setLine(`done ${manifest.length}`);
    })().catch((e) => setLine(`failed ${String(e)}`));
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 17 }}>{line}</Text>
    </View>
  );
}
