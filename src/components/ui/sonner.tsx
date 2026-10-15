import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      offset={16}
      gap={10}
      visibleToasts={3}
      closeButton
      className="toaster group apple-toaster"
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-[20px] !border !border-white/15 !bg-[hsl(225_28%_13%_/_0.84)] !text-foreground !shadow-[0_18px_44px_-18px_hsl(225_65%_3%_/_0.95)] !backdrop-blur-2xl",
          title: "!font-medium !tracking-[-0.01em]",
          description: "!text-muted-foreground",
          actionButton: "!rounded-full !bg-primary !text-primary-foreground !shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.3)]",
          cancelButton: "!rounded-full !bg-white/10 !text-muted-foreground",
          closeButton: "!border-white/15 !bg-[hsl(225_28%_16%_/_0.9)] !text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
