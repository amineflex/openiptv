interface NotFoundProps {
	message?: string;
}

const NotFound = ({ message = "Item not found" }: NotFoundProps) => (
	<div className="flex items-center justify-center h-screen text-center">
		<p className="text-xl text-red-500">{message}</p>
	</div>
);

export default NotFound;
