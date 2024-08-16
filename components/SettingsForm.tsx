// components/SettingsForm.tsx

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { settingsSchema, SettingsType, sorterSettingsSchema } from '@/types/settings.type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useSettings } from '@/hooks/useSettings';
import SerialPortFormInput from '@/components/SerialPortFormInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { serialPortNamesArray } from '@/types/serialPort.type';
import { Card } from '@/components/ui/card';

const SettingsForm = () => {
  const { settings, saveSettings } = useSettings();

  const form = useForm<SettingsType>({
    resolver: zodResolver(settingsSchema),
    // defaultValues: settings || settingsSchema.parse({}),
    values: settings || settingsSchema.parse({}),
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'sorters',
  });

  const onSubmit: SubmitHandler<SettingsType> = (data) => {
    console.log('Saving Settings data: ', data);
    saveSettings(data);
  };

  if (!settings) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 pt-2">
        <Card className="grid w-full grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1 p-2">
          <FormField
            control={form.control}
            name="conveyorSpeed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conveyor Speed</FormLabel>
                <FormControl>
                  <Input className="w-16" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="detectDistanceThreshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Detect Distance Threshold</FormLabel>
                <FormControl>
                  <Input className="w-16" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="classificationThresholdPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Classification Threshold Percentage</FormLabel>
                <FormControl>
                  <Input className="w-16" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera1VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Camera1 Vertical Position </FormLabel>
                <FormControl>
                  <Input className="w-16" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera2VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Camera2 Vertical Position</FormLabel>
                <FormControl>
                  <Input className="w-16" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          <SerialPortFormInput control={form.control} name="conveyorJetsSerialPort" label="Conveyor Jets Serial Port" />
          <SerialPortFormInput control={form.control} name="hopperFeederSerialPort" label="Hopper Feeder Serial Port" />
        </Card>
        {fields.map((field, index) => (
          <Card key={field.id} className="flex flex-row items-end space-x-2 p-2">
            <FormField
              control={form.control}
              name={`sorters.${index}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arduino Name</FormLabel>
                  <Select defaultValue={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a name for port" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {serialPortNamesArray.map((portName) => (
                        <SelectItem key={portName} value={portName}>
                          {portName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />

            <SerialPortFormInput control={form.control} name={`sorters.${index}.serialPort`} label="Serial Port" />

            <FormField
              control={form.control}
              name={`sorters.${index}.jetPosition`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jet Position</FormLabel>
                  <FormControl>
                    <Input className="w-20" {...field} />
                  </FormControl>

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
                    <Input className="w-16" {...field} />
                  </FormControl>

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
                    <Input className="w-16" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.maxPartDimensions.width`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Part Width</FormLabel>
                  <FormControl>
                    <Input className="w-16" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.maxPartDimensions.height`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Part Height</FormLabel>
                  <FormControl>
                    <Input className="w-16" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <Button size="sm" variant="destructive" onClick={() => remove(index)}>
              Delete
            </Button>
          </Card>
        ))}
        <Button type="button" onClick={() => append(sorterSettingsSchema.parse({}))}>
          Add Sorter
        </Button>
        <Button type="submit">Save Settings</Button>
      </form>
    </Form>
  );
};

export default SettingsForm;
