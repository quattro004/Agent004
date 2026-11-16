import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { TextInput } from '../../src/components/TextInput';
import { MAX_MESSAGE_CHARS } from '../../src/config/constants';

describe('TextInput', () => {
  it('renders an input element', () => {
    render(<TextInput onSubmit={() => {}} />);
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });

  it('defaults to the shared 2,000-character message limit', () => {
    render(<TextInput onSubmit={() => {}} />);
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    expect(MAX_MESSAGE_CHARS).toBe(2000);
    expect(input.maxLength).toBe(MAX_MESSAGE_CHARS);
  });

  it('refuses to submit a message longer than the limit', () => {
    // The browser attribute stops typing, but a paste or an autofill can
    // still put an over-long value in the field. The runtime would refuse it
    // with `message_too_long` after the request had already been paid for.
    const onSubmit = vi.fn();
    render(<TextInput onSubmit={onSubmit} maxLength={10} />);
    const input = screen.getByTestId('text-input');

    fireEvent.change(input, { target: { value: 'x'.repeat(11) } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with trimmed text on Enter', () => {
    const onSubmit = vi.fn();
    render(<TextInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('clears input after submit', () => {
    render(<TextInput onSubmit={() => {}} />);
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  it('does not submit empty text', () => {
    const onSubmit = vi.fn();
    render(<TextInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('text-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when disabled', () => {
    const onSubmit = vi.fn();
    render(<TextInput onSubmit={onSubmit} disabled />);
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('respects maxLength prop', () => {
    render(<TextInput onSubmit={() => {}} maxLength={10} />);
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    expect(input.maxLength).toBe(10);
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} onSubmit={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.getAttribute('data-testid')).toBe('text-input');
  });

  it('can be focused programmatically via forwarded ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} onSubmit={() => {}} />);
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });
});
