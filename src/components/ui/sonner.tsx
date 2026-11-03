import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={16}
      gap={10}
      visibleToasts={3}
      closeButton
      className="toaster group apple-toaster"
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-[20px] !border !border-white/25 !bg-[hsl(var(--primary)/0.78)] !bg-gradient-to-br !from-white/15 !to-transparent !text-white !shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.3),0_18px_44px_-18px_hsl(var(--primary)/0.6)] !backdrop-blur-2xl !backdrop-saturate-150",
          title: "!font-medium !tracking-[-0.01em]",
          description: "!text-white/85",
          actionButton: "!rounded-full !bg-white !text-primary !shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.3)]",
          cancelButton: "!rounded-full !bg-white/15 !text-white",
          closeButton: "!border-white/25 !bg-primary !text-white",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
