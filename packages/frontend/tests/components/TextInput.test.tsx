import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextInput } from '../../src/components/TextInput';

describe('TextInput', () => {
  it('renders an input element', () => {
    render(<TextInput onSubmit={() => {}} />);
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
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
});
