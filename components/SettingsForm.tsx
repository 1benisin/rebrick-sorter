// components/SettingsForm.tsx

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { settingsSchema, SettingsType, sorterSettingsSchema } from '@/types/settings.type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useSettings } from '@/components/hooks/useSettings';
import SerialPortFormInput from '@/components/SerialPortFormInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { serialPortNamesArray } from '@/types/serialPort.type';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useToast } from '@/components/hooks/use-toast';

const SettingsForm = () => {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();

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
    toast({
      title: 'Settings saved',
      description: 'Your settings have been successfully saved.',
    });
  };

  if (!settings) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 pt-2">
        <Card className="flex w-full flex-row gap-2 p-3">
          <FormField
            control={form.control}
            name="conveyorSpeed"
            render={({ field }) => (
              <FormItem className="flex flex-1 flex-col justify-between">
                <FormLabel>Conveyor Speed</FormLabel>
                <FormControl>
                  <Input className="w-full" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="detectDistanceThreshold"
            render={({ field }) => (
              <FormItem className="flex flex-1 flex-col justify-between">
                <FormLabel>Detect Distance Threshold</FormLabel>
                <FormControl>
                  <Input className="w-full" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="classificationThresholdPercentage"
            render={({ field }) => (
              <FormItem className="flex flex-1 flex-col justify-between">
                <FormLabel>Classification Threshold Percentage</FormLabel>
                <FormControl>
                  <Input className="w-full" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera1VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem className="flex flex-1 flex-col justify-between">
                <FormLabel>Camera1 Vertical Position </FormLabel>
                <FormControl>
                  <Input className="w-full" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera2VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem className="flex flex-1 flex-col justify-between">
                <FormLabel>Camera2 Vertical Position</FormLabel>
                <FormControl>
                  <Input className="w-full" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Card>

        <Card className="flex w-full flex-row gap-2 p-3">
          <SerialPortFormInput control={form.control} name="conveyorJetsSerialPort" label="Conveyor Jets Serial Port" />
          <SerialPortFormInput control={form.control} name="hopperFeederSerialPort" label="Hopper Feeder Serial Port" />
        </Card>

        {/* sorter settings array */}
        {fields.map((field, index) => (
          <Collapsible key={field.id} defaultOpen>
            <Card className="border-4 p-4">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4" />
                    <h3 className="text-lg font-semibold">Sorter {index}</h3>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent collapsible from triggering
                      remove(index);
                    }}
                  >
                    Delete Sorter
                  </Button>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="grid grid-cols-4 gap-4">
                  {/* Column 1 - Basic Settings */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`sorters.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sorter Name</FormLabel>
                          <Select defaultValue={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a sorter name" />
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

                    <SerialPortFormInput
                      control={form.control}
                      name={`sorters.${index}.serialPort`}
                      label="Sorter Serial Port"
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.jetPositionStart`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Jet Position</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.jetPositionEnd`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Jet Position</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.rowMajorOrder`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2">
                          <FormLabel>Row Major Order</FormLabel>
                          <FormControl>
                            <Input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Column 2 - Grid Settings */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`sorters.${index}.gridDimension`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grid Dimension</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                            <Input {...field} />
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
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Column 3 - Offset Settings */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`sorters.${index}.xOffset`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>X Offset</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.yOffset`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Y Offset</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.xStepsToLast`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>X Steps to Last</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.yStepsToLast`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Y Steps to Last</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Column 4 - Speed Settings */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`sorters.${index}.acceleration`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Acceleration</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.homingSpeed`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Homing Speed</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`sorters.${index}.speed`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Speed</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
