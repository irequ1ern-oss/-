import { ICONS, type IconName } from './iconData';

interface Props {
  name: IconName;
  /** Контур (по умолчанию) или заливка — как неактивная и активная вкладки в iOS. */
  weight?: 'regular' | 'fill';
  size?: number;
  /** Подпись для экранного диктора; без неё иконка считается декоративной. */
  label?: string;
  class?: string;
}

export function Icon({ name, weight = 'regular', size = 24, label, class: cls }: Props) {
  const [regular, fill] = ICONS[name];
  return (
    <svg
      class={cls ? `icon ${cls}` : 'icon'}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: weight === 'fill' ? fill : regular }}
    />
  );
}
