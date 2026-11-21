import { BackupError } from '@kairos/core';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppleCancelled } from '@/platform/apple';
import { backupConfigured } from '@/platform/backup-api';
import { secretCanSync } from '@/platform/backup-key';
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
import type { Summary } from '@/state/backup-data';
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

function problem(e: unknown): string {
  if (e instanceof BackupError) {
    return e.reason === 'wrong-key' ? e.message : 'That backup could not be opened.';
  }
  if (e instanceof AccountError) {
    switch (e.reason) {
      case 'offline':
        return 'No connection. Try again when you are online.';
      case 'sign-in':
        return 'Sign in with Apple again to continue.';
      case 'conflict':
        return 'Another phone has backed up since. Choose which to keep below.';
      case 'no-secret':
        return 'This phone does not have the backup’s recovery code yet.';
      default:
        return 'Something went wrong on our side. Try again in a moment.';
    }
  }
  return 'Something went wrong. Try again.';
}

/**
 * Sign in with Apple and the private backup that goes with it. Always optional: nothing in Tender needs it, and
 * nothing here is shown unless this build has a backup server.
 *
 * `?restore=1` is the "I've used Tender before" path from the first screen: sign in, and everything comes back.
 */
export default function Account() {
  const { restore } = useLocalSearchParams<{ restore?: string }>();
  const restoring = restore === '1';
  const account = useStore((s) => s.account);
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string>();
  const [typed, setTyped] = useState('');

  const land = (r: Settled) => {
    setError(undefined);
    if (r.kind === 'choose') return setPhase({ kind: 'choose', remote: r.remote, local: r.local });
    if (r.kind === 'need-code') return setPhase({ kind: 'need-code' });
    if (r.restored && restoring) {
      // Everything is back: on to the all-set screen, which also asks about morning ideas on this phone.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/ready');
      return;
    }
    if (r.firstTime) {
      // A new backup: show the recovery code once, so it can be written down.
      currentRecoveryCode()
        .then((code) => setPhase(code ? { kind: 'code', code, firstTime: true } : { kind: 'idle' }))
        .catch(() => setPhase({ kind: 'idle' }));
      return;
    }
    setPhase({ kind: 'idle' });
  };

  const run = async <T,>(what: string, job: () => Promise<T>, then?: (v: T) => void) => {
    setPhase({ kind: 'working', what });
    setError(undefined);
    try {
      const v = await job();
      if (then) then(v);
      else setPhase({ kind: 'idle' });
    } catch (e) {
      if (e instanceof AppleCancelled) return setPhase({ kind: 'idle' });
      setError(problem(e));
      setPhase(e instanceof BackupError && phase.kind === 'need-code' ? { kind: 'need-code' } : { kind: 'idle' });
    }
  };

  if (!backupConfigured) {
    return (
      <Sheet title="Backup">
        <T variant="callout" tone="secondary">
          Backup is not available in this version of Tender.
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
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          This takes a moment.
        </T>
      </Sheet>
    );
  }

  if (phase.kind === 'code') {
    return (
      <Sheet title="Recovery code">
        <T variant="title2" style={{ marginTop: Space.m }}>
          {phase.firstTime ? 'Your backup is on. Save this.' : 'Keep this somewhere safe.'}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {secretCanSync
            ? 'A new phone on your Apple ID usually opens the backup by itself. If it ever asks for this code, it is the only other way in. '
            : 'If you ever set up a new phone, this code is how it opens the backup. '}
          Tender cannot read your backup or recover this code for you.
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
          This Apple ID already has a backup, and this phone has data of its own. They are different.
        </T>
        <View style={{ gap: Space.m, marginTop: Space.xl }}>
          <Glass radius={Radius.l} style={styles.option}>
            <T variant="headline">The backup</T>
            <T variant="footnote" tone="secondary">
              {when(remote.savedAt)} · {facts(remote)}
            </T>
            <Button
              label="Use the backup"
              compact
              style={{ marginTop: Space.m }}
              onPress={() => {
                chooseBackup();
                if (restoring) {
                  if (router.canDismiss()) router.dismissAll();
                  router.replace('/ready');
                } else setPhase({ kind: 'idle' });
              }}
            />
          </Glass>
          <Glass radius={Radius.l} style={styles.option}>
            <T variant="headline">This phone</T>
            <T variant="footnote" tone="secondary">
              {facts(local)}
            </T>
            <Button
              label="Keep this phone’s, replace the backup"
              compact
              kind="secondary"
              style={{ marginTop: Space.m }}
              onPress={() => run('Replacing the backup', keepThisPhone, () => setPhase({ kind: 'idle' }))}
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
          This backup needs its recovery code.
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          It was shown when backup was first turned on, and looks like XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.
          Tender never sees it, so it cannot be looked up for you.
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
            label="Open the backup"
            disabled={typed.trim().length < 8}
            onPress={() => run('Opening the backup', () => enterRecoveryCode(typed), land)}
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
          {restoring ? 'Bring everything back.' : 'Keep a private backup.'}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {restoring
            ? 'Sign in with the Apple ID you used before, and her cycle, what you have done and your settings come back.'
            : 'Sign in with Apple and Tender keeps an encrypted copy of her cycle and what you have done, so a new or reinstalled phone picks up where this one left off.'}
        </T>
        <View style={styles.points}>
          <Point
            title="Only you can open it"
            body="It is encrypted on this phone before it leaves. Tender and its server cannot read it."
          />
          <Point title="Nothing else is asked" body="No name, no email, no password. Just your Apple ID." />
          <Point
            title="Optional, always"
            body="Tender works fully without an account. You can delete the backup whenever you like."
          />
        </View>
        {error ? (
          <T variant="footnote" color={colors.danger} style={{ marginTop: Space.l }}>
            {error}
          </T>
        ) : null}
        <View style={{ marginTop: Space.xl }}>
          <AppleButton onPress={() => run('Signing in', signIn, land)} />
        </View>
      </Sheet>
    );
  }

  // Idle, signed in.
  return (
    <Sheet title="Backup">
      <T variant="title2" style={{ marginTop: Space.m }}>
        Signed in with Apple.
      </T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
        {account.conflict
          ? 'Another phone has backed up since. Choose which to keep.'
          : `Last backed up ${when(account.lastBackupAt)}. Changes are backed up automatically.`}
      </T>
      {error ? (
        <T variant="footnote" color={colors.danger} style={{ marginTop: Space.m }}>
          {error}
        </T>
      ) : null}
      <View style={{ gap: Space.s, marginTop: Space.xl }}>
        {account.conflict ? (
          <Button label="Choose which to keep" onPress={() => run('Looking at the backup', review, land)} />
        ) : (
          <Button label="Back up now" onPress={() => run('Backing up', backupNow)} />
        )}
        <Button
          label="Show recovery code"
          kind="secondary"
          onPress={() =>
            run('One moment', currentRecoveryCode, (code) =>
              code ? setPhase({ kind: 'code', code, firstTime: false }) : setError('No recovery code on this phone.'),
            )
          }
        />
        <Button label="Sign out" kind="ghost" onPress={signOut} />
      </View>
      <View style={{ marginTop: Space.xxl }}>
        <Press
          onPress={() => {
            const go = () => run('Deleting the backup', deleteAccount);
            if (Platform.OS === 'web') return go();
            Alert.alert(
              'Delete the backup?',
              'This erases the backup from our server and signs you out here. The data on this phone stays. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: go },
              ],
            );
          }}
          accessibilityLabel="Delete the backup and account">
          <T variant="label" color={colors.danger}>
            Delete the backup and account
          </T>
        </Press>
        <T variant="footnote" tone="tertiary" style={{ marginTop: Space.s }}>
          To stop Tender knowing your Apple ID altogether, also remove it in Settings → your name → Sign in with Apple.
        </T>
      </View>
    </Sheet>
  );
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T variant="headline">{title}</T>
      <T variant="callout" tone="secondary">
        {body}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  points: { gap: Space.l, marginTop: Space.xl },
  code: { marginTop: Space.xl, padding: Space.xl, alignItems: 'center' },
  option: { padding: Space.l, gap: 2 },
  input: { marginTop: Space.xl, borderRadius: Radius.m, paddingHorizontal: Space.l, height: 54, fontSize: 17 },
});
