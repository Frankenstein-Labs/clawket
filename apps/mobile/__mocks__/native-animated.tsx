import React from 'react';

/** Native-driver host facade; no JS animation timers in component tests. */
export const Animated = {
  View: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) => (
    React.createElement('AnimatedView', { ...props, ref }, children as React.ReactNode)
  )),
  Value: class {
    value: number;
    constructor(value: number) { this.value = value; }
    setValue(value: number) { this.value = value; }
    interpolate(config: { inputRange: number[]; outputRange: number[]; extrapolate?: string }) {
      return { value: this.value, ...config };
    }
  },
  timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
};

export const Easing = { linear: (value: number) => value };
