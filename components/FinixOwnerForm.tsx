// components/FinixOwnerForm.tsx
// The fields Finix wants for one person on a merchant application — the control
// person, or any beneficial owner at 25%+.
//
// This lives on its own because three places need the identical form: the
// onboarding wizard's control-person step, its additional-owners step, and the
// "add an owner" flow on an already-approved club. Finix rejects an application
// that's missing a field for ANY listed person, so three hand-maintained copies
// would eventually reject a club for a field someone forgot to add to copy #3.
import React, { useState } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { TextInput, Button, Text, useTheme } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { FinixPersonInput } from '../lib/finix';

export type FinixAddr = {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
};

export const emptyFinixAddr: FinixAddr = { line1: '', line2: '', city: '', region: '', postalCode: '' };

/**
 * One human on the application. `ownershipPercentage` is a whole-number string
 * while it's being typed; `taxId` (SSN) and `dob` are never prefilled from a
 * saved draft and never persisted to Firestore.
 */
export type FinixOwnerDraft = {
  firstName: string;
  lastName: string;
  title: string;
  ownershipPercentage: string;
  taxId: string;
  dob: Date | null;
  phone: string;
  email: string;
  address: FinixAddr;
};

export const emptyFinixOwner = (): FinixOwnerDraft => ({
  firstName: '', lastName: '', title: '', ownershipPercentage: '',
  taxId: '', dob: null, phone: '', email: '', address: { ...emptyFinixAddr },
});

export const fmtFinixDate = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

export const finixOwnerValid = (p: FinixOwnerDraft): boolean =>
  !!(p.firstName.trim() && p.lastName.trim() && p.title.trim() && p.taxId.trim() && p.dob &&
    p.phone.trim() && p.email.trim() &&
    Number(p.ownershipPercentage) > 0 && Number(p.ownershipPercentage) <= 100 &&
    p.address.line1.trim() && p.address.city.trim() && p.address.region.trim() && p.address.postalCode.trim());

/**
 * Which fields this person is still missing, in the order they appear on screen.
 * Returned as labels rather than a boolean so a blocked Continue button can say
 * what's outstanding — every field is required by Finix, so "it's greyed out and
 * I can't tell why" is otherwise the default experience.
 */
export const finixOwnerMissing = (p: FinixOwnerDraft, who = ''): string[] => {
  const prefix = who ? `${who}: ` : '';
  return ([
    !p.firstName.trim() && 'First name',
    !p.lastName.trim() && 'Last name',
    !p.title.trim() && 'Title',
    !(Number(p.ownershipPercentage) > 0 && Number(p.ownershipPercentage) <= 100) && 'Ownership % (1–100)',
    !p.taxId.trim() && 'SSN',
    !p.dob && 'Date of birth',
    !p.phone.trim() && 'Phone',
    !p.email.trim() && 'Email',
    !p.address.line1.trim() && 'Street address',
    !p.address.city.trim() && 'City',
    !p.address.region.trim() && 'State',
    !p.address.postalCode.trim() && 'ZIP code',
  ].filter(Boolean) as string[]).map((f) => `${prefix}${f}`);
};

/** Finix wants each listed owner's stake; the API takes a number. */
export const toFinixOwnerInput = (p: FinixOwnerDraft): FinixPersonInput => ({
  firstName: p.firstName.trim(),
  lastName: p.lastName.trim(),
  title: p.title.trim(),
  principalPercentageOwnership: Number(p.ownershipPercentage) || 0,
  taxId: p.taxId.replace(/\D/g, ''),
  dob: fmtFinixDate(p.dob),
  phone: p.phone.trim(),
  email: p.email.trim(),
  address: { ...p.address, country: 'USA' },
});

/**
 * Free-text field that does NOT feed state back in as `value`.
 *
 * Every keystroke here re-renders a large wizard tree. A controlled TextInput
 * re-applies its `value` prop on each of those renders, and when JS falls even
 * slightly behind the native input the value it re-applies is stale — the caret
 * jumps backwards and you lose a character. Uncontrolled + `defaultValue`
 * removes the feedback loop entirely: the native field owns the text, and
 * onChangeText still keeps our state current for validation and submission.
 *
 * Use this for plain text. Anything that REWRITES input as you type (digit
 * stripping, upper-casing) must stay controlled — the rewrite has to be
 * reflected back, and those fields are short enough that lag isn't felt.
 *
 * `defaultValue` is read only on mount, which is exactly right here: each step
 * mounts fresh, so resuming a saved draft still populates correctly.
 */
export const PlainField = React.memo(function PlainField({
  label, defaultValue, onChangeText, fieldBg, style, ...rest
}: {
  label: string;
  defaultValue: string;
  onChangeText: (t: string) => void;
  fieldBg?: any;
  style?: any;
  [key: string]: any;
}) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      defaultValue={defaultValue}
      onChangeText={onChangeText}
      autoCorrect={false}
      spellCheck={false}
      style={style || [styles.input, fieldBg]}
      {...rest}
    />
  );
});

// Secure text field (SSN / EIN) with a show/hide toggle.
export function SecureField({
  label, value, onChangeText, fieldBg,
}: { label: string; value: string; onChangeText: (t: string) => void; fieldBg?: any }) {
  const [hidden, setHidden] = useState(true);
  return (
    <TextInput
      mode="outlined"
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={hidden}
      keyboardType="number-pad"
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="oneTimeCode"
      right={<TextInput.Icon icon={hidden ? 'eye-off' : 'eye'} forceTextInputFocus={false} onPress={() => setHidden((h) => !h)} />}
      style={[styles.input, fieldBg]}
    />
  );
}

// Date field backed by the native picker. Tap to reveal an inline spinner.
export function DateField({
  label, value, onChange, fieldBg, maximumDate, dark,
}: { label: string; value: Date | null; onChange: (d: Date) => void; fieldBg?: any; maximumDate?: Date; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const display = value ? value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View pointerEvents="none">
          <TextInput mode="outlined" label={label} editable={false} value={display} right={<TextInput.Icon icon="calendar" />} style={[styles.input, fieldBg]} />
        </View>
      </Pressable>
      {open && (
        <View style={[styles.pickerWrap, fieldBg]}>
          <DateTimePicker
            value={value || new Date(2000, 0, 1)}
            mode="date"
            display="spinner"
            maximumDate={maximumDate}
            themeVariant={dark ? 'dark' : 'light'}
            onChange={(_e, d) => {
              if (Platform.OS === 'android') setOpen(false);
              if (d) onChange(d);
            }}
          />
          {Platform.OS === 'ios' && (
            <Button mode="contained" onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', marginTop: 4 }} compact>Done</Button>
          )}
        </View>
      )}
    </View>
  );
}

export function FinixAddressFields({
  value, onChange, fieldBg,
}: { value: FinixAddr; onChange: (a: FinixAddr) => void; fieldBg?: any }) {
  return (
    <>
      <PlainField label="Street address" defaultValue={value.line1} onChangeText={(t) => onChange({ ...value, line1: t })} autoCapitalize="words" textContentType="streetAddressLine1" style={[styles.input, fieldBg]} />
      <View style={styles.row}>
        <PlainField label="City" defaultValue={value.city} onChangeText={(t) => onChange({ ...value, city: t })} autoCapitalize="words" textContentType="addressCity" style={[styles.input, styles.flex2, fieldBg]} />
        <TextInput mode="outlined" label="State" value={value.region} maxLength={2} autoCapitalize="characters" onChangeText={(t) => onChange({ ...value, region: t.toUpperCase() })} style={[styles.input, styles.flex1, fieldBg]} />
      </View>
      <PlainField label="ZIP code" defaultValue={value.postalCode} keyboardType="number-pad" textContentType="postalCode" onChangeText={(t) => onChange({ ...value, postalCode: t })} style={[styles.input, fieldBg]} />
    </>
  );
}

interface Props {
  value: FinixOwnerDraft;
  onChange: (p: FinixOwnerDraft) => void;
  addressLabel?: string;
  themeName?: 'dark' | 'light';
}

export default function FinixOwnerForm({ value: p, onChange: set, addressLabel = 'Home address', themeName }: Props) {
  const theme = useTheme();
  const isDark = themeName !== 'light';
  // Outlined inputs paint this behind the floating label to mask the border.
  // It must be OPAQUE — theme.colors.elevation.* carries alpha in the dark
  // theme, which let the screen behind show through every label notch.
  const fieldBg = { backgroundColor: isDark ? '#131D33' : '#FFFFFF' };
  const today = new Date();

  return (
    <>
      <View style={styles.row}>
        <PlainField label="First name" defaultValue={p.firstName} onChangeText={(t) => set({ ...p, firstName: t })} autoCapitalize="words" textContentType="givenName" style={[styles.input, styles.flex1, fieldBg]} />
        <PlainField label="Last name" defaultValue={p.lastName} onChangeText={(t) => set({ ...p, lastName: t })} autoCapitalize="words" textContentType="familyName" style={[styles.input, styles.flex1, fieldBg]} />
      </View>
      <View style={styles.row}>
        <PlainField
          label="Title" defaultValue={p.title}
          onChangeText={(t) => set({ ...p, title: t })}
          autoCapitalize="words"
          placeholder="e.g. Owner, President"
          style={[styles.input, styles.flex2, fieldBg]}
        />
        <TextInput
          mode="outlined" label="Ownership" value={p.ownershipPercentage}
          onChangeText={(t) => set({ ...p, ownershipPercentage: t.replace(/[^0-9]/g, '').slice(0, 3) })}
          keyboardType="number-pad"
          right={<TextInput.Affix text="%" />}
          style={[styles.input, styles.flex1, fieldBg]}
        />
      </View>
      <SecureField label="SSN" value={p.taxId} onChangeText={(t) => set({ ...p, taxId: t })} fieldBg={fieldBg} />
      <DateField label="Date of birth" value={p.dob} onChange={(d) => set({ ...p, dob: d })} fieldBg={fieldBg} maximumDate={today} dark={isDark} />
      <PlainField label="Phone" defaultValue={p.phone} keyboardType="phone-pad" textContentType="telephoneNumber" onChangeText={(t) => set({ ...p, phone: t })} style={[styles.input, fieldBg]} />
      <PlainField label="Email" defaultValue={p.email} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" onChangeText={(t) => set({ ...p, email: t })} style={[styles.input, fieldBg]} />

      <Text style={[styles.subh, { color: theme.colors.onSurfaceVariant }]}>{addressLabel}</Text>
      <FinixAddressFields value={p.address} onChange={(a) => set({ ...p, address: a })} fieldBg={fieldBg} />
    </>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  subh: { marginTop: 12, marginBottom: 4, opacity: 0.8, fontSize: 14, fontWeight: '600' },
  pickerWrap: { borderRadius: 10, marginTop: -4, marginBottom: 12, paddingHorizontal: 8 },
});
