import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { HitSize, IconSize } from '../../theme/tokens';
import { PendingImageBar } from './PendingImageBar';

/** Resolve this component's fixed corner geometry; host tests do not run native hit testing. */
function attachmentTargets(view: ReturnType<typeof render>, index: number) {
  const content = view.queryByTestId(`pending-attachment-image-${index}`)
    ?? view.getByTestId(`pending-attachment-file-${index}`);
  let preview = content.parent!;
  while (typeof preview.props.onPress !== 'function') preview = preview.parent!;
  let item = preview.parent!;
  while (StyleSheet.flatten(item.props.style)?.position !== 'relative') item = item.parent!;
  const tile = StyleSheet.flatten(preview.props.style({ pressed: false }));
  const wrapper = StyleSheet.flatten(item.props.style);
  const remove = view.getByTestId(`pending-attachment-remove-${index}`);
  const target = StyleSheet.flatten(remove.props.style);
  // A short filename uses minHeight; the document wrapper takes 75% of a 320pt row.
  const wrapperWidth = wrapper.width === '75%' ? 320 * 0.75 : undefined;
  const tileWidth = typeof tile.width === 'number' ? tile.width : wrapperWidth! - wrapper.paddingRight;
  const tileHeight = typeof tile.height === 'number' ? tile.height : tile.minHeight;
  const parentWidth = wrapperWidth ?? tileWidth + wrapper.paddingRight;
  const parentHeight = tileHeight + wrapper.paddingTop;
  const slop = remove.props.hitSlop;
  const bounds = {
    left: Math.max(0, parentWidth - target.right - target.width - slop),
    right: Math.min(parentWidth, parentWidth - target.right + slop),
    top: Math.max(0, target.top - slop),
    bottom: Math.min(parentHeight, target.top + target.height + slop),
  };
  return {
    preview,
    remove,
    tile,
    parentWidth,
    parentHeight,
    bounds,
    center: { x: tileWidth / 2, y: wrapper.paddingTop + tileHeight / 2 },
    removeCenter: {
      x: parentWidth - target.right - target.width / 2,
      y: target.top + target.height / 2,
    },
  };
}

function pressAttachmentPoint(
  targets: ReturnType<typeof attachmentTargets>,
  point: { x: number; y: number },
) {
  const { bounds } = targets;
  // The absolute remove sibling has zIndex=1 and wins overlapping presses.
  const hitsRemove = point.x >= bounds.left && point.x <= bounds.right
    && point.y >= bounds.top && point.y <= bounds.bottom;
  fireEvent.press(hitsRemove ? targets.remove : targets.preview);
}

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const primitive = (name: string) => ({ children, ...props }: Record<string, unknown>) => (
    ReactRuntime.createElement(name, props, children)
  );
  const flatten = (style: unknown): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    const append = (value: unknown): void => {
      if (!value) return;
      if (Array.isArray(value)) value.forEach(append);
      else if (typeof value === 'object') Object.assign(result, value);
    };
    append(style);
    return result;
  };
  return {
    Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
    Image: primitive('Image'),
    Pressable: primitive('Pressable'),
    StyleSheet: { create: <T,>(styles: T) => styles, flatten, hairlineWidth: 1 },
    Text: primitive('Text'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('lucide-react-native', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    FileText: (props: Record<string, unknown>) => ReactRuntime.createElement(View, props),
    Plus: (props: Record<string, unknown>) => ReactRuntime.createElement(View, props),
    X: (props: Record<string, unknown>) => ReactRuntime.createElement(View, props),
  };
});

jest.mock('../../theme', () => ({
  useAppTheme: () => ({
    theme: {
      colors: {
        line: '#ddd',
        bad: '#d00',
        onAccent: '#fff',
        surface: '#fff',
        inkSecondary: '#666',
        inkTertiary: '#999',
      },
    },
  }),
}));

jest.mock('./AttachmentMenu', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    AttachmentMenu: ({ children }: { children: React.ReactNode }) => (
      ReactRuntime.createElement(View, null, children)
    ),
  };
});

describe('PendingImageBar', () => {
  it.each(['image/gif', 'image/png', 'image/jpeg'])(
    'opens the %s tile at its center instead of removing it',
    (mimeType) => {
      const onOpenPreview = jest.fn();
      const onRemove = jest.fn();
      const view = render(
        <PendingImageBar
          images={[{ uri: 'file://draft-image', mimeType, base64: 'image-data' }]}
          canAddMore={false}
          onOpenPreview={onOpenPreview}
          onRemove={onRemove}
          onPickImage={jest.fn()}
          onTakePhoto={jest.fn()}
        />,
      );
      const targets = attachmentTargets(view, 0);

      pressAttachmentPoint(targets, targets.center);

      expect(onOpenPreview).toHaveBeenCalledWith(0);
      expect(onRemove).not.toHaveBeenCalled();
      expect(targets.tile).toMatchObject({ width: 56, height: 56 });
      expect(targets.bounds.left).toBeGreaterThan(targets.center.x);
      expect(targets.bounds.right).toBeLessThanOrEqual(targets.parentWidth);
      expect(targets.bounds.bottom).toBeLessThanOrEqual(targets.parentHeight);
    },
  );

  it('keeps preview and remove actions scoped to their own attachment', () => {
    const onOpenPreview = jest.fn();
    const onRemove = jest.fn();
    const view = render(
      <PendingImageBar
        images={[0, 1].map((index) => ({
          uri: `file://draft-${index}.png`, mimeType: 'image/png', base64: 'image-data',
        }))}
        canAddMore={true}
        onOpenPreview={onOpenPreview}
        onRemove={onRemove}
        onPickImage={jest.fn()}
        onTakePhoto={jest.fn()}
      />,
    );
    const first = attachmentTargets(view, 0);
    const second = attachmentTargets(view, 1);

    pressAttachmentPoint(first, first.center);
    pressAttachmentPoint(second, second.center);
    pressAttachmentPoint(second, second.removeCenter);

    expect(onOpenPreview.mock.calls).toEqual([[0], [1]]);
    expect(onRemove.mock.calls).toEqual([[1]]);
    expect(view.getByTestId('pending-attachment-add')).toBeTruthy();
  });

  it('keeps the file tile preview separate from its accessible remove control', () => {
    const onOpenPreview = jest.fn();
    const onRemove = jest.fn();
    const view = render(
      <PendingImageBar
        images={[{
          uri: 'file://draft.pdf', mimeType: 'application/pdf', base64: 'pdf-data', fileName: 'draft.pdf',
        }]}
        canAddMore={false}
        onOpenPreview={onOpenPreview}
        onRemove={onRemove}
        onPickImage={jest.fn()}
        onTakePhoto={jest.fn()}
      />,
    );
    const targets = attachmentTargets(view, 0);

    pressAttachmentPoint(targets, targets.center);
    expect(onOpenPreview.mock.calls).toEqual([[0]]);
    expect(onRemove).not.toHaveBeenCalled();
    pressAttachmentPoint(targets, targets.removeCenter);
    expect(onRemove.mock.calls).toEqual([[0]]);
    expect(targets.preview.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'draft.pdf' });
    expect(targets.remove.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Remove' });
  });

  it('classifies a trimmed case-insensitive image MIME as an image preview', () => {
    const view = render(
      <PendingImageBar
        images={[{ uri: 'file://image.png', mimeType: ' Image/PNG ', base64: 'image-data' }]}
        canAddMore={false}
        onOpenPreview={jest.fn()}
        onRemove={jest.fn()}
        onPickImage={jest.fn()}
        onTakePhoto={jest.fn()}
      />,
    );

    expect(view.getByTestId('pending-attachment-image-0')).toBeTruthy();
    expect(view.queryByTestId('pending-attachment-file-0')).toBeNull();
  });

  it('uses localized file fallback copy without rendering a document as an image', () => {
    const view = render(
      <PendingImageBar
        images={[{
          uri: 'file://document.pdf',
          mimeType: ' Application/PDF ',
          base64: 'pdf-data',
          fileName: '   ',
        }]}
        canAddMore={false}
        onOpenPreview={jest.fn()}
        onRemove={jest.fn()}
        onPickImage={jest.fn()}
        onTakePhoto={jest.fn()}
      />,
    );

    expect(view.getByTestId('pending-attachment-file-0')).toBeTruthy();
    expect(view.getByText('File')).toBeTruthy();
    expect(view.queryByTestId('pending-attachment-image-0')).toBeNull();
  });

  it('keeps the 20pt remove affordance inside a dedicated 44pt hit target', () => {
    const onRemove = jest.fn();
    const view = render(
      <PendingImageBar
        images={[{ uri: 'file://image.jpg', mimeType: 'image/jpeg', base64: 'image-data' }]}
        canAddMore={false}
        onOpenPreview={jest.fn()}
        onRemove={onRemove}
        onPickImage={jest.fn()}
        onTakePhoto={jest.fn()}
        onChooseFile={jest.fn()}
      />,
    );

    const hitTarget = view.getByTestId('pending-attachment-remove-0');
    const visual = view.getByTestId('pending-attachment-remove-0-visual');
    expect(StyleSheet.flatten(hitTarget.props.style)).toMatchObject({
      width: HitSize.md,
      height: HitSize.md,
      top: 0,
      right: 0,
    });
    expect(StyleSheet.flatten(visual.props.style)).toMatchObject({
      width: IconSize.md,
      height: IconSize.md,
    });

    fireEvent.press(hitTarget);
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
