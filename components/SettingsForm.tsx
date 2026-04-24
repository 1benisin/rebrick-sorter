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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useToast } from '@/components/hooks/use-toast';
import { getSorterLetter } from '@/lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import TravelTimeCalibrationButton from '@/components/buttons/TravelTimeCalibrationButton';

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
      <form onSubmit={form.handleSubmit(onSubmit)} id="settings-form" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Conveyor & Detection</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="maxConveyorRPM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Conveyor RPM</FormLabel>
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
                <FormItem>
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
                <FormItem>
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
                <FormItem>
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
                <FormItem>
                  <FormLabel>Camera2 Vertical Position</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="conveyorPulsesPerRevolution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conveyor Pulses Per Revolution</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="conveyorKp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conveyor Kp</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="conveyorKi"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conveyor Ki</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="conveyorKd"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conveyor Kd</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Serial Ports</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SerialPortFormInput
              control={form.control}
              name="conveyorJetsSerialPort"
              label="Conveyor Jets Serial Port"
            />
            <SerialPortFormInput
              control={form.control}
              name="hopperFeederSerialPort"
              label="Hopper Feeder Serial Port"
            />
          </CardContent>
        </Card>

        {/* Feeder Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Feeder</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="feederVibrationSpeed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feeder Vibration Speed</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feederStopDelay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feeder Stop Delay (ms)</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feederPauseTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feeder Pause Time (ms)</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feederShortMoveTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feeder Short Move Time (ms)</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feederLongMoveTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feeder Long Move Time (ms)</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hopperCycleInterval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hopper Cycle Interval (ms)</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hopperCycleSteps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hopper Cycle Steps</FormLabel>
                  <FormControl>
                    <Input className="w-full" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Position Calibration (Encoder-based scheduling) */}
        <Card>
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4">
              <CardTitle>Position Calibration (Encoder)</CardTitle>
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  These settings control encoder-based position tracking. Use the Encoder Calibration button on the
                  Sorter page to record positions automatically, or edit values manually here.
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Camera Width in Ticks */}
                  <FormField
                    control={form.control}
                    name="positionCalibration.cameraWidthInTicks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Camera Width (ticks)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const num = e.target.valueAsNumber;
                              field.onChange(Number.isNaN(num) ? 0 : num);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Camera Width in Pixels */}
                  <FormField
                    control={form.control}
                    name="positionCalibration.cameraWidthPixels"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Camera Width (pixels)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const num = e.target.valueAsNumber;
                              field.onChange(Number.isNaN(num) ? 0 : num);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Fall Time in Counts */}
                  <FormField
                    control={form.control}
                    name="positionCalibration.fallTimeInCounts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fall Time (counts)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const num = e.target.valueAsNumber;
                              field.onChange(Number.isNaN(num) ? 0 : num);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Jet Lead Counts */}
                  <FormField
                    control={form.control}
                    name="positionCalibration.jetLeadCounts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jet Lead (counts)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const num = e.target.valueAsNumber;
                              field.onChange(Number.isNaN(num) ? 0 : num);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Sorter Rest Buffer */}
                  <FormField
                    control={form.control}
                    name="positionCalibration.sorterRestBufferInCounts"
                    render={({ field }) => (
                      <FormItem>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <FormLabel className="cursor-help underline decoration-dotted">
                              Sorter Rest Buffer (counts)
                            </FormLabel>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80">
                            <p className="text-sm">
                              Encoder counts the sorter must wait after a move completes before starting the next move.
                              This ensures the previous part has time to fully fall out of the tube.
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const num = e.target.valueAsNumber;
                              field.onChange(Number.isNaN(num) ? 0 : num);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Jet Encoder Offsets */}
                <div className="space-y-2">
                  <FormLabel className="text-sm font-medium">Jet Encoder Offsets (per sorter)</FormLabel>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {([0, 1, 2, 3] as const).map((index) => (
                      <FormField
                        key={index}
                        control={form.control}
                        name={`positionCalibration.jetEncoderOffsets.${index}` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jet {String.fromCharCode(65 + index)}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const num = e.target.valueAsNumber;
                                  field.onChange(Number.isNaN(num) ? 0 : num);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Sorter Travel Time Calibration */}
        <Card>
          <CardHeader>
            <CardTitle>Sorter Travel Time Calibration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Calibrates how long each sorter takes to move between bins. All sorters must be homed before calibration.
            </div>
            <TravelTimeCalibrationButton />
          </CardContent>
        </Card>

        {/* sorter settings array */}
        <Card>
          <CardHeader>
            <CardTitle>Sorters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Sorter {getSorterLetter(index)}</h3>
                    <Button type="button" size="sm" variant="destructive" onClick={() => remove(index)}>
                      Delete
                    </Button>
                  </div>

                  {/* Basic Settings */}
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
                    name={`sorters.${index}.jetDuration`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jet Duration (ms)</FormLabel>
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

                  {/* Grid Settings */}
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

                  {/* Offset Settings */}
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

                  {/* Speed Settings */}
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
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center justify-between pt-4">
          <Button type="button" onClick={() => append(sorterSettingsSchema.parse({}))}>
            Add Sorter
          </Button>
          <Button type="submit">Save Settings</Button>
        </div>
      </form>
    </Form>
  );
};

export default SettingsForm;
