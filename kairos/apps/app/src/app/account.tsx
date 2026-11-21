import { BackupError } from '@kairos/core';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppleCancelled } from '@/platform/apple';
import { backupConfigured } from '@/platform/backup-api';
import {
  AccountError,
  backupNow,
  chooseBackup,
  currentRecoveryCode,
  deleteAccount,
  enterRecoveryCode,
  keepThisPhone,
  review,
  signIn,
  signOut,
  type Settled,
} from '@/state/account';
import { hasLocalData, type Summary } from '@/state/backup-data';
import { useStore } from '@/state/store';
import { AppleButton } from '@/ui/apple-button';
import { Button, Press } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Sheet } from '@/ui/sheet';
import { T } from '@/ui/text';
import { alpha, Radius, Space, useTheme } from '@/ui/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; what: string }
  | { kind: 'choose'; remote: Summary; local: Summary }
  | { kind: 'need-code' }
  | { kind: 'code'; code: string; firstTime: boolean };

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';

const facts = (s: Summary) =>
  `${s.periods} ${s.periods === 1 ? 'period' : 'periods'}, ${s.ideas} ${s.ideas === 1 ? 'idea' : 'ideas'} done`;

/** Short and plain: what happened, in a few words. */
function problem(e: unknown): string {
  if (e instanceof BackupError)
    return e.reason === 'wrong-key' ? 'That code doesn’t match.' : 'That backup is damaged.';
  if (e instanceof AccountError) {
    switch (e.reason) {
      case 'offline':
        return 'No connection.';
      case 'sign-in':
        return 'Sign in again.';
      case 'conflict':
        return 'Another phone backed up first.';
      case 'no-secret':
        return 'No recovery code on this phone.';
      default:
        return 'Something went wrong. Try again.';
    }
  }
  return 'Something went wrong. Try again.';
}

/**
 * Sign in with Apple and the private backup that goes with it. Optional: nothing in Tender needs it, and nothing here
 * shows unless this build has a backup server. `?restore=1` is "I've used Tender before" from the first screen.
 */
export default function Account() {
  const { restore } = useLocalSearchParams<{ restore?: string }>();
  const restoring = restore === '1';
  const account = useStore((s) => s.account);
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string>();
  const [typed, setTyped] = useState('');

  const home = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/ready');
  };

  const land = (r: Settled) => {
    setError(undefined);
    if (r.kind === 'choose') return setPhase({ kind: 'choose', remote: r.remote, local: r.local });
    if (r.kind === 'need-code') return setPhase({ kind: 'need-code' });
    if (r.restored && restoring) return home();
    if (r.firstTime) {
      // A new backup: show the recovery code once, so it can be written down.
      currentRecoveryCode()
        .then((code) => setPhase(code ? { kind: 'code', code, firstTime: true } : { kind: 'idle' }))
        .catch(() => setPhase({ kind: 'idle' }));
      return;
    }
    setPhase({ kind: 'idle' });
  };

  /** Runs a job behind a one-line "working" screen. Whatever happens, the sheet never stays stuck there. */
  const run = async <T,>(what: string, job: () => Promise<T>, then?: (v: T) => void) => {
    const was = phase;
    setPhase({ kind: 'working', what });
    setError(undefined);
    try {
      const v = await job();
      if (then) then(v);
      else setPhase({ kind: 'idle' });
    } catch (e) {
      if (e instanceof AppleCancelled) return setPhase({ kind: 'idle' });
      // Apple wants a fresh sign-in: sign out here, so the Apple button is there to press.
      if (e instanceof AccountError && e.reason === 'sign-in') signOut();
      setError(problem(e));
      setPhase(was.kind === 'need-code' ? { kind: 'need-code' } : { kind: 'idle' });
    }
  };

  /** Back up; if this phone has no secret yet (setup was interrupted), set the backup up properly instead. */
  const backUp = () =>
    run(
      'Backing up…',
      async (): Promise<Settled | null> => {
        try {
          await backupNow();
          return null;
        } catch (e) {
          const noSecret =
            (e instanceof AccountError && e.reason === 'no-secret') ||
            (e instanceof BackupError && e.reason === 'wrong-key');
          if (noSecret) return review();
          throw e;
        }
      },
      (r) => (r ? land(r) : setPhase({ kind: 'idle' })),
    );

  // "I've used Tender before" on a phone that is already signed in but holds nothing (for instance right after Start
  // over): go and get the backup, rather than showing a screen about a backup that is not here.
  const emptyHere = !hasLocalData(useStore.getState());
  const started = useRef(false);
  useEffect(() => {
    if (!restoring || !account || !emptyHere || started.current || !backupConfigured) return;
    started.current = true;
    run('Restoring…', review, land);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoring, account, emptyHere]);

  if (!backupConfigured) {
    return (
      <Sheet title="Backup">
        <T variant="callout" tone="secondary">
          Backup isn’t available in this version.
        </T>
      </Sheet>
    );
  }

  if (phase.kind === 'working') {
    return (
      <Sheet title="Backup">
        <T variant="title2" style={{ marginTop: Space.xl }}>
          {phase.what}
        </T>
      </Sheet>
    );
  }

  if (phase.kind === 'code') {
    return (
      <Sheet title="Recovery code">
        <T variant="title2" style={{ marginTop: Space.m }}>
          Save your recovery code.
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          You may need it on a new phone.
        </T>
        <Glass radius={Radius.l} style={styles.code}>
          <T
            variant="headline"
            style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1, lineHeight: 28 }}>
            {phase.code}
          </T>
        </Glass>
        <View style={{ gap: Space.s, marginTop: Space.xl }}>
          <Button label="Copy" kind="secondary" onPress={() => Clipboard.setStringAsync(phase.code).catch(() => {})} />
          <Button label={phase.firstTime ? 'I’ve saved it' : 'Done'} onPress={() => setPhase({ kind: 'idle' })} />
        </View>
      </Sheet>
    );
  }

  if (phase.kind === 'choose') {
    const { remote, local } = phase;
    return (
      <Sheet title="Which one?">
        <T variant="callout" tone="secondary">
          This Apple ID already has a backup.
        </T>
        <View style={{ gap: Space.m, marginTop: Space.xl }}>
          <Glass radius={Radius.l} style={styles.option}>
            <T variant="headline">Backup</T>
            <T variant="footnote" tone="secondary">
              {when(remote.savedAt)} · {facts(remote)}
            </T>
            <Button
              label="Use backup"
              compact
              style={{ marginTop: Space.m }}
              onPress={() => {
                chooseBackup();
                if (restoring) home();
                else setPhase({ kind: 'idle' });
              }}
            />
          </Glass>
          <Glass radius={Radius.l} style={styles.option}>
            <T variant="headline">This phone</T>
            <T variant="footnote" tone="secondary">
              {facts(local)}
            </T>
            <Button
              label="Keep this phone’s"
              compact
              kind="secondary"
              style={{ marginTop: Space.m }}
              onPress={() => run('Saving…', keepThisPhone, () => setPhase({ kind: 'idle' }))}
            />
          </Glass>
        </View>
        {error ? (
          <T variant="footnote" color={colors.danger} style={{ marginTop: Space.l }}>
            {error}
          </T>
        ) : null}
      </Sheet>
    );
  }

  if (phase.kind === 'need-code') {
    return (
      <Sheet title="Recovery code">
        <T variant="title2" style={{ marginTop: Space.m }}>
          Enter your recovery code.
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          You saved it when you first backed up.
        </T>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="XXXX-XXXX-XXXX-…"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          style={[styles.input, { color: colors.text, backgroundColor: alpha(colors.text, 0.06) }]}
        />
        {error ? (
          <T variant="footnote" color={colors.danger} style={{ marginTop: Space.m }}>
            {error}
          </T>
        ) : null}
        <View style={{ gap: Space.s, marginTop: Space.xl }}>
          <Button
            label="Open backup"
            disabled={typed.trim().length < 8}
            onPress={() => run('Opening…', () => enterRecoveryCode(typed), land)}
          />
          <Button
            label="Not now"
            kind="ghost"
            onPress={() => {
              signOut();
              setError(undefined);
              setTyped('');
              setPhase({ kind: 'idle' });
            }}
          />
        </View>
      </Sheet>
    );
  }

  // Idle, signed out.
  if (!account) {
    return (
      <Sheet title={restoring ? 'Welcome back' : 'Backup'}>
        <T variant="title2" style={{ marginTop: Space.m }}>
          {restoring ? 'Welcome back.' : 'Back up with Apple.'}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {restoring ? 'Sign in to bring everything back.' : 'Keep everything safe. Restore it on any new phone.'}
        </T>
        <T variant="footnote" tone="tertiary" style={{ marginTop: Space.m }}>
          Encrypted. Only you can read it.
        </T>
        {error ? (
          <T variant="footnote" color={colors.danger} style={{ marginTop: Space.l }}>
            {error}
          </T>
        ) : null}
        <View style={{ marginTop: Space.xl }}>
          <AppleButton onPress={() => run('Signing in…', signIn, land)} />
        </View>
      </Sheet>
    );
  }

  // Idle, signed in.
  return (
    <Sheet title="Backup">
      <T variant="title2" style={{ marginTop: Space.m }}>
        {account.conflict ? 'Another phone backed up.' : account.lastBackupAt ? 'Backed up.' : 'Not backed up yet.'}
      </T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
        {account.conflict
          ? 'Choose which to keep.'
          : account.lastBackupAt
            ? `Last: ${when(account.lastBackupAt)}`
            : 'Tap Back up now.'}
      </T>
      {error ? (
        <T variant="footnote" color={colors.danger} style={{ marginTop: Space.m }}>
          {error}
        </T>
      ) : null}
      <View style={{ gap: Space.s, marginTop: Space.xl }}>
        {account.conflict ? (
          <Button label="Choose" onPress={() => run('Looking…', review, land)} />
        ) : (
          <Button label="Back up now" onPress={backUp} />
        )}
        <Button
          label="Recovery code"
          kind="secondary"
          onPress={() =>
            run('One moment…', currentRecoveryCode, (code) => {
              if (code) setPhase({ kind: 'code', code, firstTime: false });
              else {
                setError('No code yet. Tap Back up now.');
                setPhase({ kind: 'idle' });
              }
            })
          }
        />
        <Button label="Sign out" kind="ghost" onPress={signOut} />
      </View>
      <View style={{ marginTop: Space.xxl }}>
        <Press
          onPress={() => {
            const go = () => run('Deleting…', deleteAccount);
            if (Platform.OS === 'web') return go();
            Alert.alert('Delete the backup?', 'Your data on this phone stays.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: go },
            ]);
          }}
          accessibilityLabel="Delete the backup">
          <T variant="label" color={colors.danger}>
            Delete backup
          </T>
        </Press>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  code: { marginTop: Space.xl, padding: Space.xl, alignItems: 'center' },
  option: { padding: Space.l, gap: 2 },
  input: { marginTop: Space.xl, borderRadius: Radius.m, paddingHorizontal: Space.l, height: 54, fontSize: 17 },
});
