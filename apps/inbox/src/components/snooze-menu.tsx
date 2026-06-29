import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presetThisAfternoon, presetTomorrow, presetMonday } from "@/hooks/use-snooze";

interface SnoozeMenuProps {
  onSnooze: (until: Date) => void;
}

export function SnoozeMenu({ onSnooze }: SnoozeMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();

  const handle = (d: Date) => {
    onSnooze(d);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("snooze.label")}
          >
            <Clock className="size-3.5" />
            {t("snooze.label")}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-56 p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <SnoozeItem label={t("snooze.thisAfternoon")} onClick={() => handle(presetThisAfternoon())} />
          <SnoozeItem label={t("snooze.tomorrow")} onClick={() => handle(presetTomorrow())} />
          <SnoozeItem label={t("snooze.monday")} onClick={() => handle(presetMonday())} />
          <div className="my-1 h-px bg-border" />
          <SnoozeItem
            label={t("snooze.pickDate")}
            icon={<CalendarIcon className="size-3.5" />}
            onClick={() => {
              setOpen(false);
              setPickerOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t("snooze.pickDate")}</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={(d) => d.getTime() < new Date().setHours(0, 0, 0, 0)}
            className={cn("p-3 pointer-events-auto")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              {t("snooze.cancel")}
            </Button>
            <Button
              disabled={!date}
              onClick={() => {
                if (date) {
                  const d = new Date(date);
                  d.setHours(9, 0, 0, 0);
                  onSnooze(d);
                  setPickerOpen(false);
                  setDate(undefined);
                }
              }}
            >
              {t("snooze.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SnoozeItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
