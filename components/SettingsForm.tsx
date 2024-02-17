// In your settings/page.tsx
'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { settingsFormSchema, SettingsFormType } from '@/types/settingsForm.type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { settingsStore } from '@/stores/settingsStore';
import useSettings from '@/hooks/useSettings';

const SettingsForm = () => {
  const { settings, saveSettings } = useSettings();

  const form = useForm<SettingsFormType>({
    resolver: zodResolver(settingsFormSchema),
    mode: 'onBlur',
    values: settings || settingsFormSchema.parse({}),
  });
  const { fields, append, prepend, remove, swap, move, insert } = useFieldArray({
    control: form.control,
    name: 'sorters',
  });

  const onSubmit: SubmitHandler<SettingsFormType> = (data) => {
    console.log('Saving Settings data: ', data);
    saveSettings(data);
  };

  if (!settings) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="conveyorSpeed_PPS"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ConveyorSpeed_PPS</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>how fast the default speed is in pixels per second </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="detectDistanceThreshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>detectDistanceThreshold</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {fields.map((field, index) => (
          <div key={field.id}>
            <FormField
              control={form.control}
              name={`sorters.${index}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.gridWidth`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grid Width</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.gridHeight`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grid Height</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ))}
        <Button onClick={() => append({ name: '', gridWidth: 1, gridHeight: 1 })}>Add Sorter</Button>
        <Button type="submit">Save Settings</Button>
      </form>
    </Form>

    // add fields for sorters here
  );
};

export default SettingsForm;
